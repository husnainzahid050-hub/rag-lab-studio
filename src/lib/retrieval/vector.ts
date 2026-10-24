import type { Chunk } from "../types";
import { byScoreThenPosition } from "./bm25";

export type Vector = Float32Array | number[];

/** cos(a, b) = a·b / (‖a‖ ‖b‖), in [-1, 1]. Returns 0 when either vector has zero length. */
export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions differ (${a.length} vs ${b.length}).`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface VectorHit {
  chunk: Chunk;
  score: number;
}

export function searchVectors(
  query: Vector,
  chunks: Chunk[],
  vectors: ReadonlyMap<string, Vector>,
  k: number,
  minScore: number,
): VectorHit[] {
  const hits: VectorHit[] = [];
  for (const chunk of chunks) {
    const vector = vectors.get(chunk.id);
    if (!vector) continue;
    const score = cosineSimilarity(query, vector);
    if (score >= minScore) hits.push({ chunk, score });
  }
  return hits.sort(byScoreThenPosition).slice(0, k);
}
