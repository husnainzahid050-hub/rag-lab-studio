import { splitSentenceSpans } from "../text/sentences";
import { uniqueTerms } from "../text/tokenize";
import { cosineSimilarity } from "../retrieval/vector";
import type { AnswerGenerator, AnswerInput, AnswerResult, AnswerSentence, Citation } from "./types";

export const EXTRACTIVE_LIMITS = {
  /** A sentence must reach this evidence score to be used in an answer. */
  minEvidence: 0.5,
  /** Other sentences must score at least this fraction of the best one. */
  relativeCutoff: 0.75,
  maxSentences: 3,
} as const;

interface Candidate extends AnswerSentence {
  chunkId: string;
}

/**
 * Evidence score of a sentence:
 * - lexical only: coverage = |question terms ∩ sentence terms| / |question terms|
 * - with embeddings: 0.5 · coverage + 0.5 · cosine(question, sentence)
 */
export async function answerExtractively(input: AnswerInput): Promise<AnswerResult> {
  const method = input.embed ? "Extractive (term coverage + embedding similarity)" : "Extractive (term coverage)";
  const insufficient = (reason: string): AnswerResult => ({
    status: "insufficient_evidence",
    method,
    reason,
    sentences: [],
    citations: [],
  });

  const questionTerms = uniqueTerms(input.question);
  if (questionTerms.length === 0) {
    return insufficient("The question has no searchable words after removing common words like \"the\" or \"what\".");
  }
  if (input.retrieved.length === 0) {
    return insufficient("No chunks were retrieved for this question, so there is no evidence to answer from.");
  }

  const weight = input.termWeight ?? (() => 1);
  const weights = new Map(questionTerms.map((t) => [t, Math.max(0, weight(t))]));
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0) || 1;

  const candidates: Candidate[] = [];
  for (const item of input.retrieved) {
    for (const span of splitSentenceSpans(item.chunk.text)) {
      const text = item.chunk.text.slice(span.start, span.end);
      const sentenceTerms = new Set(uniqueTerms(text));
      const matched = questionTerms.filter((t) => sentenceTerms.has(t));
      candidates.push({
        text,
        start: span.start,
        end: span.end,
        chunkId: item.chunk.id,
        citationMarker: 0,
        evidenceScore: matched.reduce((sum, t) => sum + weights.get(t)!, 0) / totalWeight,
        matchedTerms: matched,
      });
    }
  }

  if (input.embed && candidates.length > 0) {
    const [questionVector, ...sentenceVectors] = await input.embed([input.question, ...candidates.map((c) => c.text)]);
    candidates.forEach((c, i) => {
      c.evidenceScore = 0.5 * c.evidenceScore + 0.5 * Math.max(0, cosineSimilarity(questionVector, sentenceVectors[i]));
    });
  }

  const seen = new Set<string>();
  const ranked = candidates
    .filter((c) => c.text.length >= 15)
    .sort((a, b) => b.evidenceScore - a.evidenceScore)
    .filter((c) => {
      const key = c.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const best = ranked[0];
  if (!best || best.evidenceScore < EXTRACTIVE_LIMITS.minEvidence) {
    return insufficient(
      "The retrieved chunks do not contain a sentence that covers enough of the question, so the documents do not provide sufficient evidence for an answer.",
    );
  }

  const cutoff = Math.max(EXTRACTIVE_LIMITS.minEvidence, best.evidenceScore * EXTRACTIVE_LIMITS.relativeCutoff);
  const chosen = ranked.filter((c) => c.evidenceScore >= cutoff).slice(0, EXTRACTIVE_LIMITS.maxSentences);

  const citations: Citation[] = [];
  const markerByChunk = new Map<string, number>();
  const sentences: AnswerSentence[] = chosen.map((c) => {
    let marker = markerByChunk.get(c.chunkId);
    if (marker === undefined) {
      const source = input.retrieved.find((r) => r.chunk.id === c.chunkId)!;
      marker = citations.length + 1;
      markerByChunk.set(c.chunkId, marker);
      citations.push({
        marker,
        chunkId: source.chunk.id,
        docId: source.chunk.docId,
        docName: source.chunk.docName,
        chunkIndex: source.chunk.index,
        retrievalRank: source.rank,
        retrievalScore: source.score,
      });
    }
    return {
      text: c.text,
      citationMarker: marker,
      start: c.start,
      end: c.end,
      evidenceScore: c.evidenceScore,
      matchedTerms: c.matchedTerms,
    };
  });

  return { status: "answered", method, sentences, citations };
}

export const extractiveAnswerer: AnswerGenerator = {
  id: "extractive",
  label: "Extractive answer",
  description:
    "Selects the sentences from the retrieved chunks that best cover the question and quotes them verbatim with citations. No language model writes text.",
  generate: answerExtractively,
};

export function answerText(result: AnswerResult): string {
  return result.sentences.map((s) => s.text).join(" ");
}
