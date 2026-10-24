import { describe, expect, it } from "vitest";
import { answerExtractively } from "../answering/extractive";
import { chunkDocuments } from "../chunking";
import { buildBm25Index, idf } from "../retrieval/bm25";
import { retrieve } from "../retrieval/retrieve";
import { SAMPLE_DOCUMENTS } from "../sample/documents";
import { sampleEvalCases } from "../sample/eval-cases";
import type { WorkspaceDocument } from "../types";
import { mean, percentile, precisionAtK, recallAtK, reciprocalRank } from "./metrics";
import { evidenceCoverage, isRelevantChunk, runCase, runCases, summarize, validateCase } from "./run";
import type { EvalCase } from "./types";

describe("metrics", () => {
  it("computes precision@k against k, counting missing results as not relevant", () => {
    expect(precisionAtK([true, false, true], 3)).toBeCloseTo(2 / 3);
    expect(precisionAtK([true], 5)).toBeCloseTo(0.2);
    expect(precisionAtK([], 3)).toBe(0);
    expect(precisionAtK([true, true, true, true], 2)).toBe(1);
    expect(() => precisionAtK([true], 0)).toThrow();
  });

  it("computes recall@k and returns null without ground truth", () => {
    expect(recallAtK(1, 2)).toBe(0.5);
    expect(recallAtK(0, 3)).toBe(0);
    expect(recallAtK(0, 0)).toBeNull();
    expect(() => recallAtK(3, 2)).toThrow();
  });

  it("computes reciprocal rank", () => {
    expect(reciprocalRank([false, false, true])).toBeCloseTo(1 / 3);
    expect(reciprocalRank([true])).toBe(1);
    expect(reciprocalRank([false, false])).toBe(0);
    expect(reciprocalRank([])).toBe(0);
  });

  it("averages only defined values", () => {
    expect(mean([1, null, 0])).toBe(0.5);
    expect(mean([null])).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([], 95)).toBeNull();
  });
});

const baseCase: EvalCase = {
  id: "c1",
  workspaceId: "w",
  origin: "user",
  question: "How long do refunds take?",
  expectedDocIds: ["returns"],
  evidencePhrases: ["5 to 7   business days"],
  expectedFacts: [],
  expectUnanswerable: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("validateCase", () => {
  const docIds = new Set(["returns"]);
  it("accepts a case with ground truth", () => {
    expect(validateCase(baseCase, docIds)).toEqual([]);
  });
  it("flags empty questions, missing ground truth and deleted documents", () => {
    expect(validateCase({ ...baseCase, question: " " }, docIds)).toHaveLength(1);
    expect(validateCase({ ...baseCase, expectedDocIds: [], evidencePhrases: [] }, docIds)[0]).toMatch(/at least one/);
    expect(validateCase({ ...baseCase, expectedDocIds: ["gone"] }, docIds)[0]).toMatch(/no longer/);
    expect(validateCase({ ...baseCase, expectUnanswerable: true }, docIds)[0]).toMatch(/cannot also list/);
  });
});

describe("relevance and coverage", () => {
  const chunk = (docId: string, text: string) => ({ docId, text });
  it("requires the expected document and an evidence phrase, ignoring case and whitespace", () => {
    expect(isRelevantChunk(chunk("returns", "Processed within 5 to 7\nBusiness Days."), baseCase)).toBe(true);
    expect(isRelevantChunk(chunk("other", "within 5 to 7 business days"), baseCase)).toBe(false);
    expect(isRelevantChunk(chunk("returns", "within two weeks"), baseCase)).toBe(false);
  });

  it("counts phrases as evidence units, or documents when no phrases are given", () => {
    const twoPhrases = { ...baseCase, evidencePhrases: ["alpha", "beta"] };
    expect(evidenceCoverage([chunk("returns", "alpha only")], twoPhrases)).toEqual({ found: 1, total: 2 });
    const docsOnly = { ...baseCase, expectedDocIds: ["returns", "handbook"], evidencePhrases: [] };
    expect(evidenceCoverage([chunk("returns", "x")], docsOnly)).toEqual({ found: 1, total: 2 });
  });
});

describe("running cases on the sample workspace", () => {
  const docs: WorkspaceDocument[] = SAMPLE_DOCUMENTS.map((d) => ({
    ...d,
    workspaceId: "sample",
    origin: "sample",
    sizeBytes: d.text.length,
    charCount: d.text.length,
    warnings: [],
    extractionMs: 0,
    addedAt: "2026-01-01T00:00:00.000Z",
  }));
  const chunks = chunkDocuments(docs, { strategy: "sentence", size: 500, overlap: 100 });
  const index = buildBm25Index(chunks);
  const k = 3;
  const deps = {
    k,
    docIds: new Set(docs.map((d) => d.id)),
    retrieve: (q: string) => retrieve({ query: q, k, mode: "lexical", chunks, lexicalIndex: index }),
    answer: (q: string, r: Awaited<ReturnType<typeof retrieve>>) => answerExtractively({ question: q, retrieved: r.results, termWeight: (t) => idf(index, t) }),
  };
  const cases = sampleEvalCases("2026-01-01T00:00:00.000Z");

  it("passes a supported case with full recall and finds the expected fact", async () => {
    const result = await runCase(cases.find((c) => c.id === "sample-case-leave")!, deps);
    expect(result.outcome).toBe("pass");
    expect(result.recallAtK).toBe(1);
    expect(result.reciprocalRank).toBe(1);
    expect(result.factsFound).toEqual(["22 days"]);
    expect(result.retrieved.length).toBeLessThanOrEqual(k);
  });

  it("passes the unanswerable case only when the system declines", async () => {
    const result = await runCase(cases.find((c) => c.expectUnanswerable)!, deps);
    expect(result.answerStatus).toBe("insufficient_evidence");
    expect(result.outcome).toBe("pass");
    expect(result.precisionAtK).toBeNull();
  });

  it("marks invalid cases without running them and excludes them from the pass rate", async () => {
    const invalid = { ...baseCase, id: "bad", question: "" };
    const results = await runCases([cases[0], invalid], deps);
    expect(results[1].outcome).toBe("invalid");
    const summary = summarize(results);
    expect(summary.totalCases).toBe(2);
    expect(summary.invalid).toBe(1);
    expect(summary.validCases).toBe(1);
    expect(summary.passRate).toBe(1);
  });

  it("records retrieval errors as errors that count against the pass rate", async () => {
    const failing = { ...deps, retrieve: async () => Promise.reject(new Error("model crashed")) };
    const results = await runCases([cases[0]], failing);
    expect(results[0].outcome).toBe("error");
    expect(results[0].reasons).toEqual(["model crashed"]);
    expect(summarize(results).passRate).toBe(0);
  });

  it("reports the summary of exactly the cases that ran", async () => {
    const results = await runCases(cases, deps);
    const summary = summarize(results);
    expect(summary.totalCases).toBe(cases.length);
    expect(summary.passed + summary.failed + summary.errored + summary.invalid).toBe(cases.length);
    expect(summary.passRate).toBeCloseTo(summary.passed / summary.validCases);
  });

  it("fails exactly the sample cases whose wording is absent from the documents (lexical limitation)", async () => {
    const results = await runCases(cases, deps);
    const failing = results.filter((r) => r.outcome !== "pass").map((r) => r.caseId);
    // Retrieval still finds the evidence (recall 1), but "money" and "temperature" never occur in
    // the sample text, so no sentence covers the question well enough and the answerer declines.
    expect(failing.sort()).toEqual(["sample-case-money-back", "sample-case-water-temp"]);
    expect(results.filter((r) => failing.includes(r.caseId)).map((r) => r.recallAtK)).toEqual([1, 1]);
  });

  it("returns null summary metrics when nothing ran", () => {
    const summary = summarize([]);
    expect(summary.passRate).toBeNull();
    expect(summary.meanPrecisionAtK).toBeNull();
  });
});
