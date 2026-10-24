import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_VERSION, clearAllData, createVectorStore, describeStorageError, loadState, saveState, type PersistedState } from "./storage";
import { DEFAULT_SETTINGS, sampleDocuments, useAppStore } from "./store";

const initialState = useAppStore.getState();

function stateWith(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    version: STORAGE_VERSION,
    activeWorkspaceId: "personal",
    documents: sampleDocuments("2026-01-01T00:00:00.000Z").slice(0, 1),
    evalCases: [],
    evalRuns: [],
    settings: { ...DEFAULT_SETTINGS, retrieval: { ...DEFAULT_SETTINGS.retrieval, topK: 7 } },
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAllData();
  useAppStore.setState(initialState, true);
});

describe("IndexedDB persistence", () => {
  it("returns null when nothing has been saved", async () => {
    expect(await loadState()).toBeNull();
  });

  it("round-trips the saved state", async () => {
    const state = stateWith();
    await saveState(state);
    expect(await loadState()).toEqual(state);
  });

  it("ignores data written by an unknown storage version", async () => {
    await saveState(stateWith({ version: 999 }));
    expect(await loadState()).toBeNull();
  });

  it("clears documents and cached vectors", async () => {
    await saveState(stateWith());
    const vectors = createVectorStore();
    await vectors.setMany([["model:abc", new Float32Array([1, 2])]]);
    await clearAllData();
    expect(await loadState()).toBeNull();
    expect(await vectors.getMany(["model:abc"])).toEqual([undefined]);
  });

  it("hydrates the app store from saved data, or seeds the sample workspace on first visit", async () => {
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState().documents.every((d) => d.origin === "sample")).toBe(true);
    expect(useAppStore.getState().evalCases.length).toBeGreaterThan(0);

    useAppStore.setState(initialState, true);
    await saveState(stateWith());
    await useAppStore.getState().hydrate();
    const s = useAppStore.getState();
    expect(s.activeWorkspaceId).toBe("personal");
    expect(s.settings.retrieval.topK).toBe(7);
    expect(s.storage).toEqual({ state: "ok" });
  });

  it("explains quota errors in plain language", () => {
    const quota = new DOMException("full", "QuotaExceededError");
    expect(describeStorageError(quota)).toMatch(/storage is full/);
    expect(describeStorageError(new Error("x"))).toMatch(/may not survive/);
  });
});
