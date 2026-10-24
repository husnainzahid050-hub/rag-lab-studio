import { tokenize } from "../text/tokenize";
import type { Chunk } from "../types";

export const BM25_PARAMS = { k1: 1.2, b: 0.75 } as const;

interface IndexedChunk {
  chunk: Chunk;
  termFreq: Map<string, number>;
  length: number;
}

export interface Bm25Index {
  docs: IndexedChunk[];
  docFreq: Map<string, number>;
  avgLength: number;
}

export interface LexicalHit {
  chunk: Chunk;
  score: number;
  matchedTerms: string[];
}

export function buildBm25Index(chunks: Chunk[]): Bm25Index {
  const docFreq = new Map<string, number>();
  let totalLength = 0;
  const docs = chunks.map((chunk) => {
    const terms = tokenize(chunk.text);
    const termFreq = new Map<string, number>();
    for (const t of terms) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    for (const t of termFreq.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    totalLength += terms.length;
    return { chunk, termFreq, length: terms.length };
  });
  return { docs, docFreq, avgLength: docs.length ? totalLength / docs.length : 0 };
}

/** BM25 inverse document frequency; the "+ 1" keeps it positive for very common terms. */
export function idf(index: Bm25Index, term: string): number {
  const n = index.docs.length;
  const df = index.docFreq.get(term) ?? 0;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

/**
 * Okapi BM25:
 *   score(q, d) = Σ_t idf(t) · tf(t,d)·(k1 + 1) / (tf(t,d) + k1·(1 − b + b·|d| / avgdl))
 * Only chunks sharing at least one query term are returned.
 */
export function searchBm25(index: Bm25Index, query: string, k: number): LexicalHit[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || index.docs.length === 0) return [];
  const { k1, b } = BM25_PARAMS;
  const hits: LexicalHit[] = [];

  for (const doc of index.docs) {
    let score = 0;
    const matched: string[] = [];
    for (const term of queryTerms) {
      const tf = doc.termFreq.get(term);
      if (!tf) continue;
      matched.push(term);
      const norm = tf + k1 * (1 - b + (b * doc.length) / (index.avgLength || 1));
      score += idf(index, term) * ((tf * (k1 + 1)) / norm);
    }
    if (matched.length > 0) hits.push({ chunk: doc.chunk, score, matchedTerms: matched });
  }

  return hits.sort(byScoreThenPosition).slice(0, k);
}

export function byScoreThenPosition(a: { score: number; chunk: Chunk }, b: { score: number; chunk: Chunk }): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.chunk.docId !== b.chunk.docId) return a.chunk.docId < b.chunk.docId ? -1 : 1;
  return a.chunk.index - b.chunk.index;
}
