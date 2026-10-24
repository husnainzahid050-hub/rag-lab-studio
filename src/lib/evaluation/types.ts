import type { ChunkSettings, ContentOrigin, RetrievalMode } from "../types";

export interface EvalCase {
  id: string;
  workspaceId: string;
  origin: ContentOrigin;
  question: string;
  /** Documents that should supply the evidence. Empty means "any document". */
  expectedDocIds: string[];
  /** Phrases that a relevant chunk must contain (case and whitespace insensitive). */
  evidencePhrases: string[];
  /** Facts the answer text must contain. Optional. */
  expectedFacts: string[];
  /** The documents do not answer this question; the system should say so. */
  expectUnanswerable: boolean;
  createdAt: string;
}

export type CaseOutcome = "pass" | "fail" | "invalid" | "error";

export interface CaseResult {
  caseId: string;
  origin: ContentOrigin;
  question: string;
  outcome: CaseOutcome;
  /** Why the case failed, was invalid, or errored. Empty for passes. */
  reasons: string[];
  retrieved: { chunkId: string; docName: string; chunkIndex: number; score: number; relevant: boolean }[];
  precisionAtK: number | null;
  recallAtK: number | null;
  reciprocalRank: number | null;
  answerStatus: "answered" | "insufficient_evidence" | null;
  answerText: string;
  factsFound: string[];
  factsMissing: string[];
  retrievalMs: number;
  totalMs: number;
}

export interface EvalSummary {
  totalCases: number;
  validCases: number;
  passed: number;
  failed: number;
  invalid: number;
  errored: number;
  passRate: number | null;
  meanPrecisionAtK: number | null;
  meanRecallAtK: number | null;
  meanReciprocalRank: number | null;
  meanRetrievalMs: number | null;
  p95RetrievalMs: number | null;
}

export interface EvalRun {
  id: string;
  workspaceId: string;
  startedAt: string;
  durationMs: number;
  config: {
    mode: RetrievalMode;
    topK: number;
    chunking: ChunkSettings;
    chunkCount: number;
    embeddingModel: string | null;
    answerer: string;
  };
  results: CaseResult[];
  summary: EvalSummary;
}
