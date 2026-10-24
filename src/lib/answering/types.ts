import type { RetrievedChunk } from "../retrieval/retrieve";
import type { Vector } from "../retrieval/vector";

export interface Citation {
  /** The number shown in the answer, e.g. [1]. */
  marker: number;
  chunkId: string;
  docId: string;
  docName: string;
  chunkIndex: number;
  retrievalRank: number;
  retrievalScore: number;
}

export interface AnswerSentence {
  text: string;
  citationMarker: number;
  /** Offsets of the sentence inside the cited chunk's text. */
  start: number;
  end: number;
  evidenceScore: number;
  matchedTerms: string[];
}

export type AnswerResult =
  | {
      status: "answered";
      method: string;
      sentences: AnswerSentence[];
      citations: Citation[];
    }
  | {
      status: "insufficient_evidence";
      method: string;
      reason: string;
      sentences: [];
      citations: [];
    };

export interface AnswerInput {
  question: string;
  retrieved: RetrievedChunk[];
  /** Importance of a question term, e.g. its IDF in the corpus. Defaults to 1 for every term. */
  termWeight?: (term: string) => number;
  /** Evidence score a sentence needs to be quoted; defaults to the balanced threshold. */
  minEvidence?: number;
  /** Optional sentence embedder; when present, meaning-level similarity also counts as evidence. */
  embed?: (texts: string[]) => Promise<Vector[]>;
}

/**
 * Anything that turns retrieved chunks into an answer. The extractive answerer is
 * the only implementation today; a generative model can implement the same contract.
 */
export interface AnswerGenerator {
  id: string;
  label: string;
  description: string;
  generate(input: AnswerInput): Promise<AnswerResult>;
}
