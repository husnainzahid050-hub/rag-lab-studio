import type { EvalCase } from "../evaluation/types";
import { SAMPLE_WORKSPACE_ID } from "./documents";

type SampleCase = Pick<EvalCase, "id" | "question" | "expectedDocIds" | "evidencePhrases" | "expectedFacts" | "expectUnanswerable">;

const CASES: SampleCase[] = [
  {
    id: "sample-case-leave",
    question: "How many days of paid annual leave do full-time employees get?",
    expectedDocIds: ["sample-handbook"],
    evidencePhrases: ["22 days of paid annual leave"],
    expectedFacts: ["22 days"],
    expectUnanswerable: false,
  },
  {
    id: "sample-case-refund-time",
    question: "How long does refund processing take?",
    expectedDocIds: ["sample-returns"],
    evidencePhrases: ["processed within 5 to 7 business days"],
    expectedFacts: ["5 to 7 business days"],
    expectUnanswerable: false,
  },
  {
    id: "sample-case-money-back",
    question: "When will I get my money back after sending something back?",
    expectedDocIds: ["sample-returns"],
    evidencePhrases: ["processed within 5 to 7 business days"],
    expectedFacts: [],
    expectUnanswerable: false,
  },
  {
    id: "sample-case-water-temp",
    question: "What water temperature should be used for brewing?",
    expectedDocIds: ["sample-brewing"],
    evidencePhrases: ["between 92 and 96 degrees Celsius"],
    expectedFacts: ["92 and 96 degrees"],
    expectUnanswerable: false,
  },
  {
    id: "sample-case-descaling",
    question: "How often must espresso machines be descaled?",
    expectedDocIds: ["sample-maintenance"],
    evidencePhrases: ["descaled every three months"],
    expectedFacts: ["every three months"],
    expectUnanswerable: false,
  },
  {
    id: "sample-case-express",
    question: "How much does express delivery cost?",
    expectedDocIds: ["sample-returns"],
    evidencePhrases: ["costs 6.50 EUR"],
    expectedFacts: ["6.50 EUR"],
    expectUnanswerable: false,
  },
  {
    id: "sample-case-unanswerable",
    question: "Who founded the company and in which year?",
    expectedDocIds: [],
    evidencePhrases: [],
    expectedFacts: [],
    expectUnanswerable: true,
  },
];

export function sampleEvalCases(createdAt: string): EvalCase[] {
  return CASES.map((c) => ({ ...c, workspaceId: SAMPLE_WORKSPACE_ID, origin: "sample", createdAt }));
}
