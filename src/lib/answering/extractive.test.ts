import { describe, expect, it } from "vitest";
import { chunkDocuments } from "../chunking";
import { buildBm25Index, idf } from "../retrieval/bm25";
import { retrieve, type RetrievedChunk } from "../retrieval/retrieve";
import { SAMPLE_DOCUMENTS } from "../sample/documents";
import type { WorkspaceDocument } from "../types";
import { answerExtractively, answerText, isQuotable } from "./extractive";

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

async function ask(question: string) {
  const retrieval = await retrieve({ query: question, k: 4, mode: "lexical", chunks, lexicalIndex: index });
  const termWeight = (t: string) => idf(index, t);
  return { retrieval, answer: await answerExtractively({ question, retrieved: retrieval.results, termWeight }) };
}

describe("answerExtractively", () => {
  it("answers a supported question with a verbatim sentence and a citation", async () => {
    const { retrieval, answer } = await ask("How many days of paid annual leave do full-time employees get?");
    expect(answer.status).toBe("answered");
    expect(answerText(answer)).toContain("22 days of paid annual leave");
    const retrievedIds = new Set(retrieval.results.map((r) => r.chunk.id));
    for (const c of answer.citations) expect(retrievedIds.has(c.chunkId)).toBe(true);
  });

  it("only quotes text that exists in the cited chunk at the recorded offsets", async () => {
    const { answer } = await ask("How often must espresso machines be descaled?");
    expect(answer.status).toBe("answered");
    for (const s of answer.sentences) {
      const citation = answer.citations.find((c) => c.marker === s.citationMarker)!;
      const chunk = chunks.find((c) => c.id === citation.chunkId)!;
      expect(chunk.text.slice(s.start, s.end)).toBe(s.text);
    }
  });

  it("numbers citations from 1 without gaps and reuses markers for the same chunk", async () => {
    const { answer } = await ask("What grind size does the French press need?");
    expect(answer.citations.map((c) => c.marker)).toEqual(answer.citations.map((_, i) => i + 1));
    const markers = new Set(answer.sentences.map((s) => s.citationMarker));
    expect(markers.size).toBe(answer.citations.length);
  });

  it("reports insufficient evidence for an unsupported question", async () => {
    const { answer } = await ask("Who founded the company and in which year?");
    expect(answer.status).toBe("insufficient_evidence");
    expect(answer.citations).toEqual([]);
    expect(answer.sentences).toEqual([]);
  });

  it("does not answer when only common words match (regression: 'Who founded the company?')", async () => {
    const { retrieval, answer } = await ask("Who founded the company?");
    expect(retrieval.results.length).toBeGreaterThan(0);
    expect(answer.status).toBe("insufficient_evidence");
  });

  it("weights rare question terms more than common ones", async () => {
    const retrieved: RetrievedChunk[] = [{ chunk: { ...chunks[0], text: "The company sells coffee to many customers." }, rank: 1, score: 1 }];
    const unweighted = await answerExtractively({ question: "Who founded the company?", retrieved });
    expect(unweighted.status).toBe("answered");
    const weighted = await answerExtractively({
      question: "Who founded the company?",
      retrieved,
      termWeight: (t) => (t === "found" ? 4 : 0.5),
    });
    expect(weighted.status).toBe("insufficient_evidence");
  });

  it("reports insufficient evidence when nothing was retrieved", async () => {
    const answer = await answerExtractively({ question: "What is the refund policy?", retrieved: [] });
    expect(answer.status).toBe("insufficient_evidence");
    if (answer.status === "insufficient_evidence") expect(answer.reason).toMatch(/No chunks were retrieved/);
  });

  it("reports insufficient evidence for a question made only of stopwords", async () => {
    const retrieved: RetrievedChunk[] = [{ chunk: chunks[0], rank: 1, score: 1 }];
    const answer = await answerExtractively({ question: "what is it?", retrieved });
    expect(answer.status).toBe("insufficient_evidence");
  });

  it("can use sentence embeddings as additional evidence", async () => {
    const retrieved: RetrievedChunk[] = [
      { chunk: { ...chunks[0], text: "Refunds take one week to arrive in your account." }, rank: 1, score: 0.9 },
    ];
    // Fake embedder: every text maps to the same direction, so similarity is 1.
    const embed = async (texts: string[]) => texts.map(() => [1, 0]);
    const answer = await answerExtractively({ question: "When will I get my money back?", retrieved, embed });
    expect(answer.status).toBe("answered");
    expect(answer.method).toMatch(/embedding/);
  });
});

describe("answer focus and quotability", () => {
  const brief = [
    "Project Apollo brief",
    "Project Apollo launches on 14 March 2027 in Lahore and Karachi.",
    "The approved budget is 2.4 million euros, managed by the finance office.",
    "The project lead is Dana Weber, who reports to the steering committee every month.",
  ].join("\n\n");
  const docsWithBrief: WorkspaceDocument[] = [...docs, { ...docs[0], id: "brief", name: "apollo-brief.docx", text: brief, charCount: brief.length }];
  const allChunks = chunkDocuments(docsWithBrief, { strategy: "sentence", size: 500, overlap: 100 });
  const allIndex = buildBm25Index(allChunks);

  async function askAll(question: string) {
    const retrieval = await retrieve({ query: question, k: 4, mode: "lexical", chunks: allChunks, lexicalIndex: allIndex });
    return answerExtractively({ question, retrieved: retrieval.results, termWeight: (t) => idf(allIndex, t) });
  }

  it("quotes the sentence with the distinctive word, not a title that repeats the topic", async () => {
    const answer = await askAll("What is the budget of Project Apollo?");
    expect(answer.status).toBe("answered");
    expect(answer.sentences[0].text).toContain("2.4 million euros");
    expect(answerText(answer)).not.toContain("Project Apollo brief");
  });

  it("answers a role question from the right sentence", async () => {
    const answer = await askAll("Who is the project lead?");
    expect(answer.sentences[0].text).toContain("Dana Weber");
  });

  it("never quotes headings or fragments", () => {
    expect(isQuotable("# Refunds")).toBe(false);
    expect(isQuotable("Project Apollo brief")).toBe(false);
    expect(isQuotable("The budget is 2.4 million euros.")).toBe(true);
  });
});
