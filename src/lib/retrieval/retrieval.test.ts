import { describe, expect, it, vi } from "vitest";
import { chunkDocuments } from "../chunking";
import { SAMPLE_DOCUMENTS } from "../sample/documents";
import type { Chunk, WorkspaceDocument } from "../types";
import { buildBm25Index, searchBm25 } from "./bm25";
import { EmbeddingUnavailableError, RetrievalInputError, retrieve } from "./retrieve";
import { cosineSimilarity, searchVectors } from "./vector";

function makeChunk(id: string, text: string, docId = "doc", index = 0): Chunk {
  return { id, docId, docName: `${docId}.txt`, index, start: 0, end: text.length, text };
}

const sampleDocs: WorkspaceDocument[] = SAMPLE_DOCUMENTS.map((d) => ({
  ...d,
  workspaceId: "sample",
  origin: "sample",
  sizeBytes: d.text.length,
  charCount: d.text.length,
  warnings: [],
  extractionMs: 0,
  addedAt: "2026-01-01T00:00:00.000Z",
}));
const sampleChunks = chunkDocuments(sampleDocs, { strategy: "sentence", size: 500, overlap: 100 });
const sampleIndex = buildBm25Index(sampleChunks);

describe("cosineSimilarity", () => {
  it("is 1 for identical direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for a zero vector and throws on dimension mismatch", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimensions/);
  });
});

describe("searchVectors", () => {
  it("ranks by similarity, honours k and the minimum score", () => {
    const chunks = [makeChunk("a", "a", "d", 0), makeChunk("b", "b", "d", 1), makeChunk("c", "c", "d", 2)];
    const vectors = new Map([
      ["a", [1, 0]],
      ["b", [0.8, 0.6]],
      ["c", [0, 1]],
    ]);
    const hits = searchVectors([1, 0], chunks, vectors, 2, -1);
    expect(hits.map((h) => h.chunk.id)).toEqual(["a", "b"]);
    expect(searchVectors([1, 0], chunks, vectors, 5, 0.5).map((h) => h.chunk.id)).toEqual(["a", "b"]);
  });
});

describe("BM25", () => {
  it("finds the chunk that contains the query terms", () => {
    const hits = searchBm25(sampleIndex, "descaling espresso machines", 3);
    expect(hits[0].chunk.docId).toBe("sample-maintenance");
    expect(hits[0].chunk.text).toContain("descaled every three months");
    expect(hits[0].matchedTerms).toContain("descal");
  });

  it("ranks rarer matching terms higher", () => {
    const chunks = [
      makeChunk("1", "coffee coffee coffee beans", "d", 0),
      makeChunk("2", "coffee grinder burrs", "d", 1),
      makeChunk("3", "coffee cups", "d", 2),
    ];
    const hits = searchBm25(buildBm25Index(chunks), "grinder coffee", 3);
    expect(hits[0].chunk.id).toBe("2");
  });

  it("returns nothing when no chunk shares a term with the query", () => {
    expect(searchBm25(sampleIndex, "quantum chromodynamics", 5)).toEqual([]);
  });

  it("returns nothing for an empty collection", () => {
    expect(searchBm25(buildBm25Index([]), "coffee", 5)).toEqual([]);
  });

  it("respects the top-k limit", () => {
    expect(searchBm25(sampleIndex, "coffee", 2)).toHaveLength(2);
  });
});

describe("retrieve", () => {
  const base = { chunks: sampleChunks, lexicalIndex: sampleIndex, k: 3 } as const;

  it("rejects empty queries and invalid k", async () => {
    await expect(retrieve({ ...base, mode: "lexical", query: "   " })).rejects.toBeInstanceOf(RetrievalInputError);
    await expect(retrieve({ ...base, mode: "lexical", query: "coffee", k: 0 })).rejects.toBeInstanceOf(RetrievalInputError);
    await expect(retrieve({ ...base, mode: "lexical", query: "coffee", k: 21 })).rejects.toBeInstanceOf(RetrievalInputError);
  });

  it("returns ranked lexical results with matched terms and a measured latency", async () => {
    let t = 0;
    const response = await retrieve({ ...base, mode: "lexical", query: "express delivery cost", now: () => (t += 5) });
    expect(response.results.map((r) => r.rank)).toEqual([1, 2, 3].slice(0, response.results.length));
    expect(response.results[0].chunk.text).toContain("6.50 EUR");
    expect(response.latencyMs).toBe(5);
    for (let i = 1; i < response.results.length; i++) {
      expect(response.results[i - 1].score).toBeGreaterThanOrEqual(response.results[i].score);
    }
  });

  it("returns an empty result list for an empty collection", async () => {
    const response = await retrieve({ query: "coffee", k: 3, mode: "lexical", chunks: [], lexicalIndex: buildBm25Index([]) });
    expect(response.results).toEqual([]);
  });

  it("throws EmbeddingUnavailableError in semantic mode without a model", async () => {
    await expect(retrieve({ ...base, mode: "semantic", query: "coffee", semantic: null })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it("uses the embedding backend in semantic mode and reports unindexed chunks", async () => {
    const vectors = new Map(sampleChunks.slice(1).map((c, i) => [c.id, [1, i]]));
    const embedQuery = vi.fn(async () => [1, 0]);
    const response = await retrieve({ ...base, mode: "semantic", query: "anything", semantic: { embedQuery, vectors, minScore: -1 } });
    expect(embedQuery).toHaveBeenCalledWith("anything");
    expect(response.unindexedChunks).toBe(1);
    expect(response.results[0].chunk.id).toBe(sampleChunks[1].id);
    expect(response.results[0].score).toBeCloseTo(1);
  });
});
