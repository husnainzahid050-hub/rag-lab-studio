import { describe, expect, it } from "vitest";
import {
  ChunkSettingsError,
  chunkDocument,
  chunkText,
  fixedSpans,
  overlapWithPrevious,
  validateChunkSettings,
} from "./chunking";
import type { ChunkSettings } from "./types";

const fixed = (size: number, overlap: number): ChunkSettings => ({ strategy: "fixed", size, overlap });
const sentence = (size: number, overlap: number): ChunkSettings => ({ strategy: "sentence", size, overlap });

describe("validateChunkSettings", () => {
  it("accepts sensible settings", () => {
    expect(validateChunkSettings(fixed(500, 100))).toEqual([]);
    expect(validateChunkSettings(sentence(100, 0))).toEqual([]);
  });

  it("rejects sizes outside the allowed range or non-integers", () => {
    expect(validateChunkSettings(fixed(0, 0))).toHaveLength(1);
    expect(validateChunkSettings(fixed(99, 0))).toHaveLength(1);
    expect(validateChunkSettings(fixed(4001, 0))).toHaveLength(1);
    expect(validateChunkSettings(fixed(250.5, 0))).toHaveLength(1);
    expect(validateChunkSettings(fixed(Number.NaN, 0))).toHaveLength(1);
  });

  it("rejects negative overlap and overlap above half the size", () => {
    expect(validateChunkSettings(fixed(200, -1))[0]).toMatch(/0 or more/);
    expect(validateChunkSettings(fixed(200, 101))[0]).toMatch(/at most half/);
    expect(validateChunkSettings(fixed(200, 100))).toEqual([]);
    expect(validateChunkSettings(fixed(200, 200))).toHaveLength(1);
  });

  it("makes chunkText throw instead of looping on invalid input", () => {
    expect(() => chunkText("hello world", fixed(200, 200))).toThrow(ChunkSettingsError);
    expect(() => chunkText("hello world", fixed(100, -5))).toThrow(ChunkSettingsError);
  });
});

describe("fixed chunking", () => {
  it("returns no chunks for empty or whitespace-only text", () => {
    expect(chunkText("", fixed(100, 0))).toEqual([]);
    expect(chunkText("   \n\t ", fixed(100, 0))).toEqual([]);
  });

  it("returns a single chunk for text shorter than the size", () => {
    expect(chunkText("short text", fixed(100, 20))).toEqual([{ start: 0, end: 10 }]);
  });

  it("produces exact windows that step by size - overlap", () => {
    expect(fixedSpans(250, 100, 20)).toEqual([
      { start: 0, end: 100 },
      { start: 80, end: 180 },
      { start: 160, end: 250 },
    ]);
  });

  it("does not emit a redundant final chunk when the text ends on a boundary", () => {
    expect(fixedSpans(200, 100, 0)).toEqual([
      { start: 0, end: 100 },
      { start: 100, end: 200 },
    ]);
  });

  it("covers long text completely and every chunk respects the size", () => {
    const text = "abcdefghij".repeat(1000);
    const spans = chunkText(text, fixed(300, 50));
    expect(spans[0].start).toBe(0);
    expect(spans.at(-1)!.end).toBe(text.length);
    for (const s of spans) expect(s.end - s.start).toBeLessThanOrEqual(300);
    for (let i = 1; i < spans.length; i++) expect(spans[i - 1].end - spans[i].start).toBe(50);
  });
});

describe("sentence chunking", () => {
  const text =
    "First sentence is here. Second sentence follows it. Third one is a bit longer than the rest. Fourth closes.";

  it("never splits a sentence when sentences fit", () => {
    const spans = chunkText(text, sentence(100, 0));
    for (const s of spans) {
      const piece = text.slice(s.start, s.end);
      expect(piece.endsWith(".")).toBe(true);
      expect(piece.length).toBeLessThanOrEqual(100);
    }
    expect(spans.length).toBeGreaterThan(1);
  });

  it("repeats whole trailing sentences as overlap", () => {
    const spans = chunkText(text, sentence(100, 50));
    expect(spans.length).toBeGreaterThan(1);
    const shared = spans[0].end - spans[1].start;
    expect(shared).toBeGreaterThan(0);
    expect(shared).toBeLessThanOrEqual(50);
    expect(text.slice(spans[1].start, spans[0].end)).toMatch(/\.$/);
  });

  it("splits a single very long sentence into windows", () => {
    const long = "word ".repeat(100).trim() + ".";
    const spans = chunkText(long, sentence(120, 0));
    expect(spans.length).toBeGreaterThan(1);
    for (const s of spans) expect(s.end - s.start).toBeLessThanOrEqual(120);
  });

  it("always makes progress even when overlap could cover a whole chunk", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Sentence number ${i}.`).join(" ");
    const spans = chunkText(many, sentence(100, 50));
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThan(spans[i - 1].start);
    expect(spans.at(-1)!.end).toBe(many.length);
  });
});

describe("chunkDocument", () => {
  it("preserves the source text exactly at the recorded offsets", () => {
    const doc = { id: "d1", name: "doc.txt", text: "Alpha beta gamma. Delta epsilon.\n\nZeta eta theta iota kappa. ".repeat(20) };
    for (const settings of [fixed(150, 30), sentence(150, 30)]) {
      const chunks = chunkDocument(doc, settings);
      for (const c of chunks) {
        expect(c.text).toBe(doc.text.slice(c.start, c.end));
        expect(c.id).toBe(`d1::${c.index}`);
        expect(c.docName).toBe("doc.txt");
      }
    }
  });

  it("reports overlap only between neighbours in the same document", () => {
    const a = chunkDocument({ id: "a", name: "a", text: "x".repeat(250) }, fixed(100, 25));
    expect(overlapWithPrevious(a[1], a[0])).toBe(25);
    expect(overlapWithPrevious(a[0], undefined)).toBe(0);
    const b = chunkDocument({ id: "b", name: "b", text: "y".repeat(50) }, fixed(100, 25));
    expect(overlapWithPrevious(b[0], a.at(-1))).toBe(0);
  });
});
