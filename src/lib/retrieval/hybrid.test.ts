import { describe, expect, it } from "vitest";
import type { Chunk } from "../types";
import { buildBm25Index } from "./bm25";
import { RRF_K, fuseRankings, retrieve } from "./retrieve";

function chunk(id: string, text: string, index = 0): Chunk {
  return { id, docId: "d", docName: "d.txt", index, start: 0, end: text.length, text };
}

describe("fuseRankings (Reciprocal Rank Fusion)", () => {
  const a = chunk("a", "a", 0);
  const b = chunk("b", "b", 1);
  const c = chunk("c", "c", 2);

  it("scores each chunk as the sum of 1 / (k + rank) over the lists it appears in", () => {
    const fused = fuseRankings(
      [
        { chunk: a, score: 9 },
        { chunk: b, score: 5 },
      ],
      [
        { chunk: b, score: 0.9 },
        { chunk: c, score: 0.8 },
      ],
    );
    const byId = new Map(fused.map((r) => [r.chunk.id, r]));
    expect(byId.get("b")!.score).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1));
    expect(byId.get("a")!.score).toBeCloseTo(1 / (RRF_K + 1));
    expect(byId.get("c")!.score).toBeCloseTo(1 / (RRF_K + 2));
    expect(fused[0].chunk.id).toBe("b");
    expect(byId.get("b")!.fusion).toEqual({ lexicalRank: 2, lexicalScore: 5, semanticRank: 1, semanticScore: 0.9 });
    expect(byId.get("c")!.fusion?.lexicalRank).toBeUndefined();
  });

  it("returns an empty list when both rankers return nothing", () => {
    expect(fuseRankings([], [])).toEqual([]);
  });
});

describe("retrieve in hybrid mode", () => {
  const chunks = [
    chunk("refund", "Refunds are processed within five business days.", 0),
    chunk("money", "You get your money back after we inspect the parcel.", 1),
    chunk("other", "The roaster is cleaned twice a year.", 2),
  ];
  const index = buildBm25Index(chunks);
  // Fake embeddings: "money" and "refund" chunks point the same way as the query.
  const vectors = new Map([
    ["refund", [1, 0]],
    ["money", [0.9, 0.1]],
    ["other", [0, 1]],
  ]);

  it("combines lexical and vector rankings and records both ranks", async () => {
    const response = await retrieve({
      query: "refund",
      k: 3,
      mode: "hybrid",
      chunks,
      lexicalIndex: index,
      semantic: { embedQuery: async () => [1, 0], vectors, minScore: 0.5 },
    });
    expect(response.mode).toBe("hybrid");
    expect(response.results[0].chunk.id).toBe("refund");
    expect(response.results[0].fusion).toMatchObject({ lexicalRank: 1, semanticRank: 1 });
    // Found only by the vector ranker: still included, with no lexical rank.
    const money = response.results.find((r) => r.chunk.id === "money")!;
    expect(money.fusion?.lexicalRank).toBeUndefined();
    expect(money.fusion?.semanticRank).toBe(2);
    expect(response.results.map((r) => r.rank)).toEqual(response.results.map((_, i) => i + 1));
  });

  it("needs the embedding backend", async () => {
    await expect(retrieve({ query: "refund", k: 3, mode: "hybrid", chunks, lexicalIndex: index, semantic: null })).rejects.toThrow(/not loaded/);
  });
});
