import type { Chunk, RetrievalMode } from "../types";
import { searchBm25, type Bm25Index } from "./bm25";
import { searchVectors, type Vector } from "./vector";

export const TOP_K_LIMITS = { min: 1, max: 20 } as const;

export const SCORE_DESCRIPTIONS: Record<RetrievalMode, string> = {
  lexical:
    "BM25 score: a sum over query terms that appear in the chunk, weighted by how rare each term is. It is unbounded and only comparable between results of the same query.",
  semantic:
    "Cosine similarity between the query embedding and the chunk embedding, from -1 to 1. Higher means closer in meaning. It is not a probability or a calibrated confidence.",
};

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
}

export interface RetrievalResponse {
  query: string;
  mode: RetrievalMode;
  k: number;
  results: RetrievedChunk[];
  latencyMs: number;
  /** Chunks that had no vector and were therefore not searched (semantic mode only). */
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
