import { create } from "zustand";
import { DEFAULT_CHUNK_SETTINGS } from "./chunking";
import type { EmbeddingStatus } from "./embeddings/types";
import type { EvalCase, EvalRun } from "./evaluation/types";
import { createId } from "./ids";
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
import type { AnswerSettings, ChunkSettings, RetrievalSettings, Workspace, WorkspaceDocument } from "./types";
import { materializeBundle, type WorkspaceBundle } from "./workspace-io";

export const SAMPLE_WORKSPACE: Workspace = { id: SAMPLE_WORKSPACE_ID, name: "Sample workspace", origin: "sample" };
export const DEFAULT_USER_WORKSPACE: Workspace = { id: USER_WORKSPACE_ID, name: "My workspace", origin: "user" };
export const DEFAULT_WORKSPACES: Workspace[] = [SAMPLE_WORKSPACE, DEFAULT_USER_WORKSPACE];

export const MAX_RUNS_PER_WORKSPACE = 10;
export const MAX_WORKSPACE_NAME = 60;

export const DEFAULT_SETTINGS: PersistedSettings = {
  chunking: DEFAULT_CHUNK_SETTINGS,
  retrieval: { mode: "lexical", topK: 4, semanticMinScore: 0.2 },
  answer: { strictness: "balanced" },
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
  workspaces: Workspace[];
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
  createWorkspace(name: string): string;
  renameWorkspace(id: string, name: string): void;
  deleteWorkspace(id: string): void;
  importWorkspace(bundle: WorkspaceBundle): string;
  addDocument(doc: WorkspaceDocument): void;
  removeDocument(id: string): void;
  setChunking(settings: ChunkSettings): void;
  setRetrieval(settings: Partial<RetrievalSettings>): void;
  setAnswer(settings: Partial<AnswerSettings>): void;
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

function seededState(): Omit<PersistedState, "version" | "settings"> & { workspaces: Workspace[]; settings: PersistedSettings } {
  const now = new Date().toISOString();
  return {
    workspaces: DEFAULT_WORKSPACES,
    activeWorkspaceId: SAMPLE_WORKSPACE_ID,
    documents: sampleDocuments(now),
    evalCases: sampleEvalCases(now),
    evalRuns: [],
    settings: DEFAULT_SETTINGS,
  };
}

export function mergeSettings(settings: Partial<PersistedSettings> | undefined): PersistedSettings {
  return {
    chunking: { ...DEFAULT_SETTINGS.chunking, ...settings?.chunking },
    retrieval: { ...DEFAULT_SETTINGS.retrieval, ...settings?.retrieval },
    answer: { ...DEFAULT_SETTINGS.answer, ...settings?.answer },
    semanticEnabled: settings?.semanticEnabled ?? false,
  };
}

/**
 * Workspaces saved before they became editable are not stored, so they are rebuilt from the
 * defaults plus any workspace ID still referenced by a document.
 */
function resolveWorkspaces(stored: PersistedState): Workspace[] {
  const list = stored.workspaces?.length ? [...stored.workspaces] : [...DEFAULT_WORKSPACES];
  for (const doc of stored.documents) {
    if (!list.some((w) => w.id === doc.workspaceId)) list.push({ id: doc.workspaceId, name: "Recovered workspace", origin: "user" });
  }
  return list.length ? list : [DEFAULT_USER_WORKSPACE];
}

export function cleanWorkspaceName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_WORKSPACE_NAME);
}

export const useAppStore = create<AppState>()((set, get) => ({
  hydrated: false,
  storage: { state: "pending" },
  workspaces: DEFAULT_WORKSPACES,
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
      if (!stored) {
        set({ ...seededState(), hydrated: true, storage: { state: "ok" } });
        return;
      }
      const workspaces = resolveWorkspaces(stored);
      set({
        workspaces,
        activeWorkspaceId: workspaces.some((w) => w.id === stored.activeWorkspaceId) ? stored.activeWorkspaceId : workspaces[0].id,
        documents: stored.documents,
        evalCases: stored.evalCases,
        evalRuns: stored.evalRuns,
        settings: mergeSettings(stored.settings),
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
    if (!get().workspaces.some((w) => w.id === id) || id === get().activeWorkspaceId) return;
    set({ activeWorkspaceId: id, pipeline: idlePipeline() });
  },

  createWorkspace(name) {
    const id = createId("ws");
    const workspace: Workspace = { id, name: cleanWorkspaceName(name) || "Untitled workspace", origin: "user" };
    set((s) => ({ workspaces: [...s.workspaces, workspace], activeWorkspaceId: id, pipeline: idlePipeline() }));
    return id;
  },

  renameWorkspace(id, name) {
    const clean = cleanWorkspaceName(name);
    if (!clean) return;
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: clean } : w)) }));
  },

  deleteWorkspace(id) {
    set((s) => {
      let workspaces = s.workspaces.filter((w) => w.id !== id);
      if (workspaces.length === 0) workspaces = [{ ...DEFAULT_USER_WORKSPACE, id: createId("ws") }];
      const switching = s.activeWorkspaceId === id;
      const next = workspaces.find((w) => w.origin === "user") ?? workspaces[0];
      return {
        workspaces,
        documents: s.documents.filter((d) => d.workspaceId !== id),
        evalCases: s.evalCases.filter((c) => c.workspaceId !== id),
        evalRuns: s.evalRuns.filter((r) => r.workspaceId !== id),
        uploads: s.uploads.filter((u) => u.workspaceId !== id),
        activeWorkspaceId: switching ? next.id : s.activeWorkspaceId,
        pipeline: switching ? idlePipeline() : s.pipeline,
      };
    });
  },

  importWorkspace(bundle) {
    const id = createId("ws");
    const { documents, evalCases } = materializeBundle(bundle, id, createId);
    const taken = new Set(get().workspaces.map((w) => w.name));
    let name = cleanWorkspaceName(bundle.workspace.name) || "Imported workspace";
    if (taken.has(name)) name = cleanWorkspaceName(`${name} (imported)`);
    set((s) => ({
      workspaces: [...s.workspaces, { id, name, origin: "user" }],
      documents: [...s.documents, ...documents],
      evalCases: [...s.evalCases, ...evalCases],
      activeWorkspaceId: id,
      pipeline: idlePipeline(),
    }));
    return id;
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

  setAnswer(answer) {
    set((s) => ({ settings: { ...s.settings, answer: { ...s.settings.answer, ...answer } } }));
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
      return { uploads: exists ? s.uploads.map((u) => (u.id === entry.id ? entry : u)) : [entry, ...s.uploads].slice(0, 30) };
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

  /** Restores the sample workspace (re-adding it if it was deleted) with its original content. */
  resetSampleWorkspace() {
    const now = new Date().toISOString();
    set((s) => ({
      workspaces: s.workspaces.some((w) => w.id === SAMPLE_WORKSPACE_ID) ? s.workspaces : [SAMPLE_WORKSPACE, ...s.workspaces],
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
      workspaces: s.workspaces,
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
      state.workspaces !== previous.workspaces ||
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

export function useActiveWorkspace(): Workspace | undefined {
  return useAppStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId));
}
