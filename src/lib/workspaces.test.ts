import { beforeEach, describe, expect, it } from "vitest";
import { answerExtractively, STRICTNESS_THRESHOLDS } from "./answering/extractive";
import { chunkDocuments } from "./chunking";
import { buildBm25Index } from "./retrieval/bm25";
import { SAMPLE_WORKSPACE_ID } from "./sample/documents";
import { clearAllData, loadState, saveState, STORAGE_VERSION } from "./storage";
import { DEFAULT_SETTINGS, sampleDocuments, useAppStore } from "./store";
import { topTopics } from "./text/topics";
import type { WorkspaceDocument } from "./types";
import { BundleError, exportWorkspace, materializeBundle, parseWorkspaceBundle } from "./workspace-io";

const initialState = useAppStore.getState();

function doc(id: string, workspaceId: string, text: string): WorkspaceDocument {
  return {
    id,
    workspaceId,
    name: `${id}.txt`,
    kind: "text",
    origin: "user",
    sizeBytes: text.length,
    text,
    charCount: text.length,
    warnings: [],
    extractionMs: 0,
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(async () => {
  await clearAllData();
  useAppStore.setState(initialState, true);
  await useAppStore.getState().hydrate();
});

describe("workspace management", () => {
  it("creates, renames and opens a workspace", () => {
    const id = useAppStore.getState().createWorkspace("  Research   papers ");
    let s = useAppStore.getState();
    expect(s.activeWorkspaceId).toBe(id);
    expect(s.workspaces.find((w) => w.id === id)).toMatchObject({ name: "Research papers", origin: "user" });
    s.renameWorkspace(id, "Papers");
    s = useAppStore.getState();
    expect(s.workspaces.find((w) => w.id === id)!.name).toBe("Papers");
    s.renameWorkspace(id, "   ");
    expect(useAppStore.getState().workspaces.find((w) => w.id === id)!.name).toBe("Papers");
  });

  it("deletes a workspace with its documents and switches away from it", () => {
    const id = useAppStore.getState().createWorkspace("Temp");
    useAppStore.getState().addDocument(doc("d1", id, "hello"));
    useAppStore.getState().deleteWorkspace(id);
    const s = useAppStore.getState();
    expect(s.workspaces.some((w) => w.id === id)).toBe(false);
    expect(s.documents.some((d) => d.workspaceId === id)).toBe(false);
    expect(s.activeWorkspaceId).not.toBe(id);
  });

  it("can delete the sample workspace and restore it later", () => {
    useAppStore.getState().deleteWorkspace(SAMPLE_WORKSPACE_ID);
    expect(useAppStore.getState().workspaces.some((w) => w.id === SAMPLE_WORKSPACE_ID)).toBe(false);
    expect(useAppStore.getState().documents.some((d) => d.origin === "sample")).toBe(false);
    useAppStore.getState().resetSampleWorkspace();
    expect(useAppStore.getState().workspaces.some((w) => w.id === SAMPLE_WORKSPACE_ID)).toBe(true);
    expect(useAppStore.getState().documents.filter((d) => d.workspaceId === SAMPLE_WORKSPACE_ID)).toHaveLength(4);
  });

  it("always keeps at least one workspace", () => {
    for (const w of useAppStore.getState().workspaces) useAppStore.getState().deleteWorkspace(w.id);
    const s = useAppStore.getState();
    expect(s.workspaces).toHaveLength(1);
    expect(s.activeWorkspaceId).toBe(s.workspaces[0].id);
  });

  it("rebuilds the workspace list for data saved before workspaces were stored", async () => {
    useAppStore.setState(initialState, true);
    await saveState({
      version: STORAGE_VERSION,
      activeWorkspaceId: "personal",
      documents: [doc("d1", "personal", "x"), doc("d2", "lost-ws", "y")],
      evalCases: [],
      evalRuns: [],
      settings: { chunking: DEFAULT_SETTINGS.chunking },
    });
    await useAppStore.getState().hydrate();
    const s = useAppStore.getState();
    expect(s.workspaces.map((w) => w.id)).toEqual(["sample", "personal", "lost-ws"]);
    expect(s.settings.answer.strictness).toBe("balanced");
    expect(s.activeWorkspaceId).toBe("personal");
  });

  it("persists the workspace list", async () => {
    const id = useAppStore.getState().createWorkspace("Saved");
    const s = useAppStore.getState();
    await saveState({ version: STORAGE_VERSION, workspaces: s.workspaces, activeWorkspaceId: id, documents: s.documents, evalCases: s.evalCases, evalRuns: [], settings: s.settings });
    expect((await loadState())!.workspaces!.some((w) => w.name === "Saved")).toBe(true);
  });
});

describe("workspace backups", () => {
  const docs = [doc("a", "ws1", "Alpha text"), doc("b", "ws1", "Beta text")];
  const cases = [
    {
      id: "c1",
      workspaceId: "ws1",
      origin: "user" as const,
      question: "What is alpha?",
      expectedDocIds: ["a"],
      evidencePhrases: ["Alpha"],
      expectedFacts: [],
      expectUnanswerable: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("round-trips through JSON and remaps IDs on import", () => {
    const bundle = parseWorkspaceBundle(JSON.parse(JSON.stringify(exportWorkspace("Mine", docs, cases))));
    expect(bundle.documents[0]).not.toHaveProperty("workspaceId");
    let n = 0;
    const { documents, evalCases } = materializeBundle(bundle, "ws2", (p) => `${p}-${++n}`);
    expect(documents.map((d) => [d.id, d.workspaceId, d.text])).toEqual([
      ["doc-1", "ws2", "Alpha text"],
      ["doc-2", "ws2", "Beta text"],
    ]);
    expect(evalCases[0]).toMatchObject({ workspaceId: "ws2", expectedDocIds: ["doc-1"] });
  });

  it("rejects files that are not valid backups", () => {
    expect(() => parseWorkspaceBundle({})).toThrow(BundleError);
    expect(() => parseWorkspaceBundle({ format: "other" })).toThrow(/not a RAG Lab Studio/);
    const broken = { ...exportWorkspace("x", docs, []), documents: [{ id: "a" }] };
    expect(() => parseWorkspaceBundle(JSON.parse(JSON.stringify(broken)))).toThrow(/Document 1/);
  });

  it("imports a backup into a new active workspace without name clashes", () => {
    const bundle = exportWorkspace("My workspace", docs, cases);
    const id = useAppStore.getState().importWorkspace(bundle);
    const s = useAppStore.getState();
    expect(s.activeWorkspaceId).toBe(id);
    expect(s.workspaces.find((w) => w.id === id)!.name).toBe("My workspace (imported)");
    expect(s.documents.filter((d) => d.workspaceId === id)).toHaveLength(2);
  });
});

describe("answer strictness", () => {
  it("orders thresholds strict > balanced > lenient", () => {
    expect(STRICTNESS_THRESHOLDS.strict).toBeGreaterThan(STRICTNESS_THRESHOLDS.balanced);
    expect(STRICTNESS_THRESHOLDS.balanced).toBeGreaterThan(STRICTNESS_THRESHOLDS.lenient);
  });

  it("answers with lower thresholds and declines with higher ones", async () => {
    const chunk = { id: "c", docId: "d", docName: "d", index: 0, start: 0, end: 40, text: "Refunds are paid to the original card." };
    const input = { question: "Are refunds paid in cash or by bank transfer?", retrieved: [{ chunk, rank: 1, score: 1 }] };
    expect((await answerExtractively({ ...input, minEvidence: STRICTNESS_THRESHOLDS.lenient })).status).toBe("answered");
    expect((await answerExtractively({ ...input, minEvidence: STRICTNESS_THRESHOLDS.strict })).status).toBe("insufficient_evidence");
  });
});

describe("topTopics", () => {
  it("suggests readable words that recur across chunks", () => {
    const chunks = chunkDocuments(sampleDocuments("x"), { strategy: "sentence", size: 500, overlap: 100 });
    const topics = topTopics(buildBm25Index(chunks), 8);
    expect(topics.length).toBeGreaterThan(3);
    expect(topics.length).toBeLessThanOrEqual(8);
    for (const t of topics) expect(t).toMatch(/^[\p{L}]{4,}$/u);
  });

  it("returns nothing for an empty index", () => {
    expect(topTopics(buildBm25Index([]))).toEqual([]);
  });
});
