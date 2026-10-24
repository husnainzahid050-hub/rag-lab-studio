import { splitSentenceSpans, type Span } from "./text/sentences";
import type { Chunk, ChunkSettings, WorkspaceDocument } from "./types";

export const CHUNK_LIMITS = {
  minSize: 100,
  maxSize: 4000,
  /** Overlap is capped at half the chunk size so each step advances by at least size / 2. */
  maxOverlapRatio: 0.5,
} as const;

export const DEFAULT_CHUNK_SETTINGS: ChunkSettings = { strategy: "sentence", size: 500, overlap: 100 };

export class ChunkSettingsError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "ChunkSettingsError";
  }
}

export function validateChunkSettings(settings: ChunkSettings): string[] {
  const problems: string[] = [];
  const { size, overlap, strategy } = settings;
  if (strategy !== "fixed" && strategy !== "sentence") problems.push(`Unknown chunking strategy "${strategy}".`);
  if (!Number.isInteger(size) || size < CHUNK_LIMITS.minSize || size > CHUNK_LIMITS.maxSize) {
    problems.push(`Chunk size must be a whole number between ${CHUNK_LIMITS.minSize} and ${CHUNK_LIMITS.maxSize} characters.`);
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    problems.push("Overlap must be a whole number of 0 or more characters.");
  } else if (Number.isInteger(size) && overlap > Math.floor(size * CHUNK_LIMITS.maxOverlapRatio)) {
    problems.push(`Overlap must be at most half the chunk size (${Math.floor(size * CHUNK_LIMITS.maxOverlapRatio)} characters).`);
  }
  return problems;
}

/** Fixed windows of exactly `size` characters, each starting `size - overlap` after the previous one. */
export function fixedSpans(length: number, size: number, overlap: number): Span[] {
  const spans: Span[] = [];
  if (length === 0) return spans;
  const step = size - overlap;
  for (let start = 0; start < length; start += step) {
    const end = Math.min(start + size, length);
    spans.push({ start, end });
    if (end === length) break;
  }
  return spans;
}

/**
 * Packs whole sentences into chunks of at most `size` characters. The next chunk
 * starts at the earliest trailing sentence(s) of the previous chunk that fit inside
 * `overlap`, so overlap never cuts a sentence in half. A sentence longer than
 * `size` is split into fixed windows.
 */
export function sentenceSpans(text: string, size: number, overlap: number): Span[] {
  const units: Span[] = [];
  for (const s of splitSentenceSpans(text)) {
    if (s.end - s.start <= size) units.push(s);
    else for (const w of fixedSpans(s.end - s.start, size, 0)) units.push({ start: s.start + w.start, end: s.start + w.end });
  }

  const spans: Span[] = [];
  let i = 0;
  while (i < units.length) {
    const start = units[i].start;
    let j = i;
    while (j + 1 < units.length && units[j + 1].end - start <= size) j++;
    const end = units[j].end;
    spans.push({ start, end });
    if (j === units.length - 1) break;

    let k = j + 1;
    while (k - 1 > i && end - units[k - 1].start <= overlap) k--;
    i = k;
  }
  return spans;
}

export function chunkText(text: string, settings: ChunkSettings): Span[] {
  const problems = validateChunkSettings(settings);
  if (problems.length) throw new ChunkSettingsError(problems);
  if (text.trim().length === 0) return [];
  return settings.strategy === "fixed"
    ? fixedSpans(text.length, settings.size, settings.overlap)
    : sentenceSpans(text, settings.size, settings.overlap);
}

export function chunkDocument(doc: Pick<WorkspaceDocument, "id" | "name" | "text">, settings: ChunkSettings): Chunk[] {
  return chunkText(doc.text, settings).map((span, index) => ({
    id: `${doc.id}::${index}`,
    docId: doc.id,
    docName: doc.name,
    index,
    start: span.start,
    end: span.end,
    text: doc.text.slice(span.start, span.end),
  }));
}

export function chunkDocuments(docs: WorkspaceDocument[], settings: ChunkSettings): Chunk[] {
  return docs.flatMap((doc) => chunkDocument(doc, settings));
}

/** Number of characters shared by a chunk and the chunk before it in the same document. */
export function overlapWithPrevious(chunk: Chunk, previous: Chunk | undefined): number {
  if (!previous || previous.docId !== chunk.docId) return 0;
  return Math.max(0, previous.end - chunk.start);
}

export function chunkLabel(chunk: Pick<Chunk, "index">): string {
  return `C${String(chunk.index + 1).padStart(3, "0")}`;
}
