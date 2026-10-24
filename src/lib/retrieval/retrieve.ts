import type { Chunk, RetrievalMode } from "../types";
import { byScoreThenPosition, searchBm25, type Bm25Index } from "./bm25";
import { searchVectors, type Vector } from "./vector";

export const TOP_K_LIMITS = { min: 1, max: 20 } as const;

export const SCORE_DESCRIPTIONS: Record<RetrievalMode, string> = {
  lexical:
    "BM25 score: a sum over query terms that appear in the chunk, weighted by how rare each term is. It is unbounded and only comparable between results of the same query.",
  semantic:
    "Cosine similarity between the query embedding and the chunk embedding, from -1 to 1. Higher means closer in meaning. It is not a probability or a calibrated confidence.",
  hybrid:
    "Reciprocal Rank Fusion of the BM25 and cosine rankings: Σ 1 / (60 + rank) over both lists. It rewards chunks that rank well in either list and best in both. Only the order is meaningful.",
};

/** Standard RRF constant from Cormack et al. (2009); dampens the influence of top ranks. */
export const RRF_K = 60;
/** How many candidates each ranker contributes before fusion. */
export const HYBRID_CANDIDATES = 50;

export class RetrievalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalInputError";
  }
}

export class EmbeddingUnavailableError extends Error {
  constructor(message = "The embedding model is not loaded, so semantic search is unavailable. Use lexical search or load the model in Settings.") {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

export interface SemanticBackend {
  embedQuery(query: string): Promise<Vector>;
  /** Vectors keyed by chunk id. Must cover every chunk for results to be complete. */
  vectors: ReadonlyMap<string, Vector>;
  minScore: number;
}

export interface RetrievedChunk {
  chunk: Chunk;
  rank: number;
  score: number;
  matchedTerms?: string[];
  /** Per-ranker ranks behind a hybrid score (1-based; missing if the ranker did not return the chunk). */
  fusion?: { lexicalRank?: number; semanticRank?: number; lexicalScore?: number; semanticScore?: number };
}

export interface RetrievalResponse {
  query: string;
  mode: RetrievalMode;
  k: number;
  results: RetrievedChunk[];
  latencyMs: number;
  /** Chunks that had no vector and were therefore not searched (semantic and hybrid modes). */
  unindexedChunks: number;
}

export interface RetrieveOptions {
  query: string;
  k: number;
  mode: RetrievalMode;
  chunks: Chunk[];
  lexicalIndex: Bm25Index;
  semantic?: SemanticBackend | null;
  now?: () => number;
}

export function validateTopK(k: number): string | null {
  if (!Number.isInteger(k) || k < TOP_K_LIMITS.min || k > TOP_K_LIMITS.max) {
    return `Top-k must be a whole number between ${TOP_K_LIMITS.min} and ${TOP_K_LIMITS.max}.`;
  }
  return null;
}

export async function retrieve(options: RetrieveOptions): Promise<RetrievalResponse> {
  const { k, mode, chunks, lexicalIndex, semantic } = options;
  const now = options.now ?? (() => performance.now());
  const query = options.query.trim();
  if (!query) throw new RetrievalInputError("Enter a query to search.");
  const kProblem = validateTopK(k);
  if (kProblem) throw new RetrievalInputError(kProblem);

  const started = now();
  let results: RetrievedChunk[];
  let unindexedChunks = 0;

  if (mode === "semantic") {
    if (!semantic) throw new EmbeddingUnavailableError();
    const queryVector = await semantic.embedQuery(query);
    unindexedChunks = chunks.filter((c) => !semantic.vectors.has(c.id)).length;
    results = searchVectors(queryVector, chunks, semantic.vectors, k, semantic.minScore).map((hit, i) => ({
      chunk: hit.chunk,
      rank: i + 1,
      score: hit.score,
    }));
  } else if (mode === "hybrid") {
    if (!semantic) throw new EmbeddingUnavailableError();
    const queryVector = await semantic.embedQuery(query);
    unindexedChunks = chunks.filter((c) => !semantic.vectors.has(c.id)).length;
    const lexical = searchBm25(lexicalIndex, query, HYBRID_CANDIDATES);
    const vector = searchVectors(queryVector, chunks, semantic.vectors, HYBRID_CANDIDATES, semantic.minScore);
    results = fuseRankings(lexical, vector).slice(0, k).map((r, i) => ({ ...r, rank: i + 1 }));
  } else {
    results = searchBm25(lexicalIndex, query, k).map((hit, i) => ({
      chunk: hit.chunk,
      rank: i + 1,
      score: hit.score,
      matchedTerms: hit.matchedTerms,
    }));
  }

  return { query, mode, k, results, latencyMs: now() - started, unindexedChunks };
}

/** Reciprocal Rank Fusion: score(c) = Σ over rankers of 1 / (RRF_K + rank of c in that ranker). */
export function fuseRankings(
  lexical: { chunk: Chunk; score: number; matchedTerms?: string[] }[],
  semantic: { chunk: Chunk; score: number }[],
): RetrievedChunk[] {
  const fused = new Map<string, RetrievedChunk>();
  const entry = (chunk: Chunk) => {
    let e = fused.get(chunk.id);
    if (!e) {
      e = { chunk, rank: 0, score: 0, fusion: {} };
      fused.set(chunk.id, e);
    }
    return e;
  };
  lexical.forEach((hit, i) => {
    const e = entry(hit.chunk);
    e.score += 1 / (RRF_K + i + 1);
    e.matchedTerms = hit.matchedTerms;
    e.fusion = { ...e.fusion, lexicalRank: i + 1, lexicalScore: hit.score };
  });
  semantic.forEach((hit, i) => {
    const e = entry(hit.chunk);
    e.score += 1 / (RRF_K + i + 1);
    e.fusion = { ...e.fusion, semanticRank: i + 1, semanticScore: hit.score };
  });
  return [...fused.values()].sort(byScoreThenPosition);
}
