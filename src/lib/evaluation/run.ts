import type { AnswerResult } from "../answering/types";
import { answerText } from "../answering/extractive";
import type { RetrievalResponse } from "../retrieval/retrieve";
import { normalizeForMatch } from "../text/tokenize";
import type { Chunk } from "../types";
import { mean, percentile, precisionAtK, recallAtK, reciprocalRank } from "./metrics";
import type { CaseResult, EvalCase, EvalSummary } from "./types";

export function validateCase(evalCase: EvalCase, docIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (!evalCase.question.trim()) problems.push("The question is empty.");
  const hasEvidence = evalCase.expectedDocIds.length > 0 || evalCase.evidencePhrases.some((p) => p.trim());
  if (evalCase.expectUnanswerable) {
    if (hasEvidence) problems.push("A case marked unanswerable cannot also list expected evidence.");
    if (evalCase.expectedFacts.some((f) => f.trim())) problems.push("A case marked unanswerable cannot list expected answer facts.");
  } else if (!hasEvidence) {
    problems.push("Add at least one expected document or evidence phrase, or mark the case as unanswerable.");
  }
  const missing = evalCase.expectedDocIds.filter((id) => !docIds.has(id));
  if (missing.length) problems.push(`${missing.length} expected document(s) are no longer in this workspace.`);
  return problems;
}

/** A chunk is relevant if it comes from an expected document (when listed) and contains an evidence phrase (when listed). */
export function isRelevantChunk(chunk: Pick<Chunk, "docId" | "text">, evalCase: EvalCase): boolean {
  if (evalCase.expectedDocIds.length > 0 && !evalCase.expectedDocIds.includes(chunk.docId)) return false;
  const phrases = evalCase.evidencePhrases.map(normalizeForMatch).filter(Boolean);
  if (phrases.length === 0) return true;
  const text = normalizeForMatch(chunk.text);
  return phrases.some((p) => text.includes(p));
}

/**
 * Evidence units for recall: each evidence phrase if any are listed, otherwise each expected document.
 * Returns how many units appear in the retrieved chunks.
 */
export function evidenceCoverage(retrieved: Pick<Chunk, "docId" | "text">[], evalCase: EvalCase): { found: number; total: number } {
  const phrases = evalCase.evidencePhrases.map(normalizeForMatch).filter(Boolean);
  const inScope = retrieved.filter((c) => evalCase.expectedDocIds.length === 0 || evalCase.expectedDocIds.includes(c.docId));
  if (phrases.length > 0) {
    const texts = inScope.map((c) => normalizeForMatch(c.text));
    const found = phrases.filter((p) => texts.some((t) => t.includes(p))).length;
    return { found, total: phrases.length };
  }
  const docs = new Set(inScope.map((c) => c.docId));
  return { found: evalCase.expectedDocIds.filter((id) => docs.has(id)).length, total: evalCase.expectedDocIds.length };
}

export interface RunCaseDeps {
  k: number;
  docIds: ReadonlySet<string>;
  retrieve: (question: string) => Promise<RetrievalResponse>;
  answer: (question: string, retrieval: RetrievalResponse) => Promise<AnswerResult>;
  now?: () => number;
}

export async function runCase(evalCase: EvalCase, deps: RunCaseDeps): Promise<CaseResult> {
  const now = deps.now ?? (() => performance.now());
  const base: CaseResult = {
    caseId: evalCase.id,
    origin: evalCase.origin,
    question: evalCase.question,
    outcome: "invalid",
    reasons: [],
    retrieved: [],
    precisionAtK: null,
    recallAtK: null,
    reciprocalRank: null,
    answerStatus: null,
    answerText: "",
    factsFound: [],
    factsMissing: [],
    retrievalMs: 0,
    totalMs: 0,
  };

  const problems = validateCase(evalCase, deps.docIds);
  if (problems.length) return { ...base, reasons: problems };

  const started = now();
  try {
    const retrieval = await deps.retrieve(evalCase.question);
    const answer = await deps.answer(evalCase.question, retrieval);
    const totalMs = now() - started;
    const chunks = retrieval.results.map((r) => r.chunk);
    const text = answerText(answer);
    const result: CaseResult = {
      ...base,
      retrieved: retrieval.results.map((r) => ({
        chunkId: r.chunk.id,
        docName: r.chunk.docName,
        chunkIndex: r.chunk.index,
        score: r.score,
        relevant: !evalCase.expectUnanswerable && isRelevantChunk(r.chunk, evalCase),
      })),
      answerStatus: answer.status,
      answerText: text,
      retrievalMs: retrieval.latencyMs,
      totalMs,
    };

    if (evalCase.expectUnanswerable) {
      const pass = answer.status === "insufficient_evidence";
      return {
        ...result,
        outcome: pass ? "pass" : "fail",
        reasons: pass ? [] : ["The system answered a question the documents are not expected to support."],
      };
    }

    const flags = result.retrieved.map((r) => r.relevant);
    const coverage = evidenceCoverage(chunks, evalCase);
    const facts = evalCase.expectedFacts.map((f) => f.trim()).filter(Boolean);
    const normalizedAnswer = normalizeForMatch(text);
    const factsFound = facts.filter((f) => normalizedAnswer.includes(normalizeForMatch(f)));
    const factsMissing = facts.filter((f) => !factsFound.includes(f));
    const recall = recallAtK(coverage.found, coverage.total);

    const reasons: string[] = [];
    if (recall !== 1) reasons.push(`Only ${coverage.found} of ${coverage.total} evidence items were in the top ${deps.k}.`);
    if (answer.status !== "answered") reasons.push("The system reported insufficient evidence.");
    if (factsMissing.length) reasons.push(`The answer is missing: ${factsMissing.join(", ")}.`);

    return {
      ...result,
      outcome: reasons.length ? "fail" : "pass",
      reasons,
      precisionAtK: precisionAtK(flags, deps.k),
      recallAtK: recall,
      reciprocalRank: reciprocalRank(flags),
      factsFound,
      factsMissing,
    };
  } catch (error) {
    return {
      ...base,
      outcome: "error",
      reasons: [error instanceof Error ? error.message : String(error)],
      totalMs: now() - started,
    };
  }
}

export function summarize(results: CaseResult[]): EvalSummary {
  // Errored cases count against the pass rate; invalid ones were never run.
  const valid = results.filter((r) => r.outcome !== "invalid");
  const passed = results.filter((r) => r.outcome === "pass").length;
  const executed = valid;
  return {
    totalCases: results.length,
    validCases: valid.length,
    passed,
    failed: results.filter((r) => r.outcome === "fail").length,
    invalid: results.filter((r) => r.outcome === "invalid").length,
    errored: results.filter((r) => r.outcome === "error").length,
    passRate: valid.length ? passed / valid.length : null,
    meanPrecisionAtK: mean(valid.map((r) => r.precisionAtK)),
    meanRecallAtK: mean(valid.map((r) => r.recallAtK)),
    meanReciprocalRank: mean(valid.map((r) => r.reciprocalRank)),
    meanRetrievalMs: mean(executed.filter((r) => r.outcome !== "error").map((r) => r.retrievalMs)),
    p95RetrievalMs: percentile(executed.filter((r) => r.outcome !== "error").map((r) => r.retrievalMs), 95),
  };
}

export async function runCases(cases: EvalCase[], deps: RunCaseDeps): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) results.push(await runCase(c, deps));
  return results;
}
