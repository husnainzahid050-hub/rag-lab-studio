import { splitSentenceSpans } from "../text/sentences";
import { uniqueTerms } from "../text/tokenize";
import { cosineSimilarity } from "../retrieval/vector";
import type { AnswerStrictness } from "../types";
import type { AnswerGenerator, AnswerInput, AnswerResult, AnswerSentence, Citation } from "./types";

export const EXTRACTIVE_LIMITS = {
  /** Default evidence score a sentence must reach to be used in an answer ("balanced"). */
  minEvidence: 0.5,
  /** Other sentences must score at least this fraction of the best one. */
  relativeCutoff: 0.75,
  maxSentences: 3,
} as const;

/** Minimum evidence score per strictness level. Lower answers more questions but is wrong more often. */
export const STRICTNESS_THRESHOLDS: Record<AnswerStrictness, number> = {
  strict: 0.65,
  balanced: EXTRACTIVE_LIMITS.minEvidence,
  lenient: 0.35,
};

/** Share of a term's weight earned when it appears in the sentence's chunk but not the sentence. */
export const CONTEXT_CREDIT = 0.5;

interface Candidate extends AnswerSentence {
  chunkId: string;
  hasFocus: boolean;
}

/** Headings and fragments are not answers: require a few words and no Markdown heading marker. */
export function isQuotable(sentence: string): boolean {
  if (/^\s*#/.test(sentence)) return false;
  const words = sentence.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 4 && sentence.length >= 15;
}

/**
 * Evidence score of a sentence:
 * - lexical only: coverage = Σ w(t) · c(t) / Σ w(t) over the question terms, where c(t) is 1 if the
 *   sentence contains t, CONTEXT_CREDIT if only the rest of its chunk does, else 0
 * - with embeddings: 0.5 · coverage + 0.5 · cosine(question, sentence)
 * w(t) is the term weight (the engine passes BM25 IDF, so rare, informative words count more;
 * a word that never occurs in the documents gets the highest weight and cannot be ignored).
 *
 * Ranking prefers sentences containing the question's focus term: the present term that is
 * rarest among the candidate sentences. "What is the budget of Project Apollo?" should quote
 * the sentence about the budget, not the title that repeats "Project Apollo".
 */
export async function answerExtractively(input: AnswerInput): Promise<AnswerResult> {
  const minEvidence = input.minEvidence ?? EXTRACTIVE_LIMITS.minEvidence;
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
  // How many lines (headings included) mention each question term; topic words that a title
  // repeats are common here, while the word that asks for a specific fact is rare.
  const sentenceFreq = new Map(questionTerms.map((t) => [t, 0]));
  for (const item of input.retrieved) {
    const chunkTerms = new Set(uniqueTerms(item.chunk.text));
    for (const span of splitSentenceSpans(item.chunk.text)) {
      const text = item.chunk.text.slice(span.start, span.end);
      const sentenceTerms = new Set(uniqueTerms(text));
      for (const t of questionTerms) if (sentenceTerms.has(t)) sentenceFreq.set(t, sentenceFreq.get(t)! + 1);
      if (!isQuotable(text)) continue;
      const matched = questionTerms.filter((t) => sentenceTerms.has(t));
      const coverage = questionTerms.reduce((sum, t) => {
        const credit = sentenceTerms.has(t) ? 1 : chunkTerms.has(t) ? CONTEXT_CREDIT : 0;
        return sum + weights.get(t)! * credit;
      }, 0);
      candidates.push({
        text,
        start: span.start,
        end: span.end,
        chunkId: item.chunk.id,
        citationMarker: 0,
        evidenceScore: coverage / totalWeight,
        matchedTerms: matched,
        hasFocus: false,
      });
    }
  }

  // Focus terms: the present question terms that occur in the fewest sentences.
  const present = questionTerms.filter((t) => sentenceFreq.get(t)! > 0);
  const minFreq = Math.min(...present.map((t) => sentenceFreq.get(t)!));
  const focus = new Set(present.filter((t) => sentenceFreq.get(t) === minFreq));
  for (const c of candidates) c.hasFocus = c.matchedTerms.some((t) => focus.has(t));

  if (input.embed && candidates.length > 0) {
    const [questionVector, ...sentenceVectors] = await input.embed([input.question, ...candidates.map((c) => c.text)]);
    candidates.forEach((c, i) => {
      c.evidenceScore = 0.5 * c.evidenceScore + 0.5 * Math.max(0, cosineSimilarity(questionVector, sentenceVectors[i]));
    });
  }

  const seen = new Set<string>();
  const sufficient = candidates
    .filter((c) => c.evidenceScore >= minEvidence)
    .sort((a, b) => Number(b.hasFocus) - Number(a.hasFocus) || b.evidenceScore - a.evidenceScore)
    .filter((c) => {
      const key = c.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const best = sufficient[0];
  if (!best) {
    return insufficient(
      "The retrieved chunks do not contain a sentence that covers enough of the question, so the documents do not provide sufficient evidence for an answer.",
    );
  }

  const cutoff = Math.max(minEvidence, best.evidenceScore * EXTRACTIVE_LIMITS.relativeCutoff);
  const chosen = sufficient
    .filter((c) => c.hasFocus === best.hasFocus && c.evidenceScore >= cutoff)
    .slice(0, EXTRACTIVE_LIMITS.maxSentences);

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
