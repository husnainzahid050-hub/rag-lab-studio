import { create } from "zustand";
import { DEFAULT_CHUNK_SETTINGS } from "./chunking";
import type { EmbeddingStatus } from "./embeddings/types";
import type { EvalCase, EvalRun } from "./evaluation/types";
import { idlePipeline, type StageId, type StageState } from "./pipeline";
import { SAMPLE_DOCUMENTS, SAMPLE_WORKSPACE_ID, USER_WORKSPACE_ID } from "./sample/documents";
import { sampleEvalCases } from "./sample/eval-cases";
import {
  STORAGE_VERSION,
  clearAllData,
  describeStorageError,
  isIndexedDbAvailable,
  loadState,
  saveState,
  type PersistedSettings,
  type PersistedState,
} from "./storage";
import type { ChunkSettings, RetrievalSettings, Workspace, WorkspaceDocument } from "./types";

export const WORKSPACES: Workspace[] = [
  { id: SAMPLE_WORKSPACE_ID, name: "Sample workspace", origin: "sample" },
  { id: USER_WORKSPACE_ID, name: "My workspace", origin: "user" },
];

export const MAX_RUNS_PER_WORKSPACE = 10;

export const DEFAULT_SETTINGS: PersistedSettings = {
  chunking: DEFAULT_CHUNK_SETTINGS,
  retrieval: { mode: "lexical", topK: 4, semanticMinScore: 0.2 },
  semanticEnabled: false,
};

export interface UploadEntry {
  id: string;
  workspaceId: string;
  name: string;
  status: "processing" | "done" | "error";
  message?: string;
  warnings?: string[];
}

export type StorageStatus =
  | { state: "pending" }
  | { state: "ok" }
  | { state: "unavailable"; message: string }
  | { state: "error"; message: string };

interface AppState {
  hydrated: boolean;
  storage: StorageStatus;
  activeWorkspaceId: string;
  documents: WorkspaceDocument[];
  evalCases: EvalCase[];
  evalRuns: EvalRun[];
  settings: PersistedSettings;
  uploads: UploadEntry[];
  pipeline: Record<StageId, StageState>;
  embedding: EmbeddingStatus;

  hydrate(): Promise<void>;
  setActiveWorkspace(id: string): void;
  addDocument(doc: WorkspaceDocument): void;
  removeDocument(id: string): void;
  setChunking(settings: ChunkSettings): void;
  setRetrieval(settings: Partial<RetrievalSettings>): void;
  setSemanticEnabled(enabled: boolean): void;
  setEmbedding(status: EmbeddingStatus): void;
  setStage(id: StageId, state: Omit<StageState, "updatedAt">): void;
  upsertUpload(entry: UploadEntry): void;
  clearUploads(): void;
  saveEvalCase(evalCase: EvalCase): void;
  removeEvalCase(id: string): void;
  addEvalRun(run: EvalRun): void;
  clearEvalRuns(workspaceId: string): void;
  resetSampleWorkspace(): void;
  clearLocalData(): Promise<void>;
}

export function sampleDocuments(now: string): WorkspaceDocument[] {
  return SAMPLE_DOCUMENTS.map((d) => ({
    id: d.id,
    workspaceId: SAMPLE_WORKSPACE_ID,
    name: d.name,
    kind: d.kind,
    origin: "sample",
    sizeBytes: new TextEncoder().encode(d.text).length,
    text: d.text.trim(),
    charCount: d.text.trim().length,
    warnings: [],
    extractionMs: 0,
    addedAt: now,
  }));
}

function seededState(): Omit<PersistedState, "version"> {
  const now = new Date().toISOString();
  return {
    activeWorkspaceId: SAMPLE_WORKSPACE_ID,
    documents: sampleDocuments(now),
    evalCases: sampleEvalCases(now),
    evalRuns: [],
    settings: DEFAULT_SETTINGS,
  };
}

function mergeSettings(settings: Partial<PersistedSettings> | undefined): PersistedSettings {
  return {
    chunking: { ...DEFAULT_SETTINGS.chunking, ...settings?.chunking },
    retrieval: { ...DEFAULT_SETTINGS.retrieval, ...settings?.retrieval },
    semanticEnabled: settings?.semanticEnabled ?? false,
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  hydrated: false,
  storage: { state: "pending" },
  activeWorkspaceId: SAMPLE_WORKSPACE_ID,
  documents: [],
  evalCases: [],
  evalRuns: [],
  settings: DEFAULT_SETTINGS,
  uploads: [],
  pipeline: idlePipeline(),
  embedding: { state: "off" },

  async hydrate() {
    if (get().hydrated) return;
    if (!isIndexedDbAvailable()) {
      set({
        ...seededState(),
        hydrated: true,
        storage: { state: "unavailable", message: "This browser does not provide IndexedDB, so nothing will be saved after you close the tab." },
      });
      return;
    }
    try {
      const stored = await loadState();
      const base = stored ?? seededState();
      set({
        activeWorkspaceId: WORKSPACES.some((w) => w.id === base.activeWorkspaceId) ? base.activeWorkspaceId : SAMPLE_WORKSPACE_ID,
        documents: base.documents,
        evalCases: base.evalCases,
        evalRuns: base.evalRuns,
        settings: mergeSettings(base.settings),
        hydrated: true,
        storage: { state: "ok" },
      });
    } catch {
      set({
        ...seededState(),
        hydrated: true,
        storage: { state: "unavailable", message: "Browser storage could not be opened (private mode or blocked site data), so nothing will be saved." },
      });
    }
  },

  setActiveWorkspace(id) {
    if (!WORKSPACES.some((w) => w.id === id)) return;
    set({ activeWorkspaceId: id, pipeline: idlePipeline() });
  },

  addDocument(doc) {
    set((s) => ({ documents: [...s.documents, doc] }));
  },

  removeDocument(id) {
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
  },

  setChunking(chunking) {
    set((s) => ({ settings: { ...s.settings, chunking } }));
  },

  setRetrieval(retrieval) {
    set((s) => ({ settings: { ...s.settings, retrieval: { ...s.settings.retrieval, ...retrieval } } }));
  },

  setSemanticEnabled(semanticEnabled) {
    set((s) => ({ settings: { ...s.settings, semanticEnabled } }));
  },

  setEmbedding(embedding) {
    set({ embedding });
  },

  setStage(id, state) {
    set((s) => ({ pipeline: { ...s.pipeline, [id]: { ...state, updatedAt: new Date().toISOString() } } }));
  },

  upsertUpload(entry) {
    set((s) => {
      const exists = s.uploads.some((u) => u.id === entry.id);
      return { uploads: exists ? s.uploads.map((u) => (u.id === entry.id ? entry : u)) : [entry, ...s.uploads].slice(0, 20) };
    });
  },

  clearUploads() {
    set((s) => ({ uploads: s.uploads.filter((u) => u.status === "processing") }));
  },

  saveEvalCase(evalCase) {
    set((s) => {
      const exists = s.evalCases.some((c) => c.id === evalCase.id);
      return { evalCases: exists ? s.evalCases.map((c) => (c.id === evalCase.id ? evalCase : c)) : [...s.evalCases, evalCase] };
    });
  },

  removeEvalCase(id) {
    set((s) => ({ evalCases: s.evalCases.filter((c) => c.id !== id) }));
  },

  addEvalRun(run) {
    set((s) => {
      const forWorkspace = [run, ...s.evalRuns.filter((r) => r.workspaceId === run.workspaceId)].slice(0, MAX_RUNS_PER_WORKSPACE);
      return { evalRuns: [...forWorkspace, ...s.evalRuns.filter((r) => r.workspaceId !== run.workspaceId)] };
    });
  },

  clearEvalRuns(workspaceId) {
    set((s) => ({ evalRuns: s.evalRuns.filter((r) => r.workspaceId !== workspaceId) }));
  },

  resetSampleWorkspace() {
    const now = new Date().toISOString();
    set((s) => ({
      documents: [...s.documents.filter((d) => d.workspaceId !== SAMPLE_WORKSPACE_ID), ...sampleDocuments(now)],
      evalCases: [...s.evalCases.filter((c) => c.workspaceId !== SAMPLE_WORKSPACE_ID), ...sampleEvalCases(now)],
      evalRuns: s.evalRuns.filter((r) => r.workspaceId !== SAMPLE_WORKSPACE_ID),
      pipeline: s.activeWorkspaceId === SAMPLE_WORKSPACE_ID ? idlePipeline() : s.pipeline,
    }));
  },

  async clearLocalData() {
    let storage: StorageStatus = get().storage;
    try {
      if (isIndexedDbAvailable()) await clearAllData();
    } catch (error) {
      storage = { state: "error", message: describeStorageError(error) };
    }
    set({ ...seededState(), uploads: [], pipeline: idlePipeline(), storage });
  },
}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persistNow() {
  const s = useAppStore.getState();
  try {
    await saveState({
      version: STORAGE_VERSION,
      activeWorkspaceId: s.activeWorkspaceId,
      documents: s.documents,
      evalCases: s.evalCases,
      evalRuns: s.evalRuns,
      settings: s.settings,
    });
    if (useAppStore.getState().storage.state !== "ok") useAppStore.setState({ storage: { state: "ok" } });
  } catch (error) {
    useAppStore.setState({ storage: { state: "error", message: describeStorageError(error) } });
  }
}

/**
 * Writes the persisted slices to IndexedDB shortly after they change, and immediately
 * when the page is hidden or closed so a pending save is not lost. Returns a cleanup function.
 */
export function startPersistence(delayMs = 300): () => void {
  const flush = () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    void persistNow();
  };
  const onVisibility = () => document.visibilityState === "hidden" && flush();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibility);

  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (!state.hydrated || state.storage.state === "unavailable") return;
    const changed =
      state.documents !== previous.documents ||
      state.evalCases !== previous.evalCases ||
      state.evalRuns !== previous.evalRuns ||
      state.settings !== previous.settings ||
      state.activeWorkspaceId !== previous.activeWorkspaceId;
    if (!changed) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistNow();
    }, delayMs);
  });

  return () => {
    flush();
    unsubscribe();
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function selectWorkspaceDocuments(state: Pick<AppState, "documents" | "activeWorkspaceId">) {
  return state.documents.filter((d) => d.workspaceId === state.activeWorkspaceId);
}
