import { clear, createStore, getMany, setMany, type UseStore } from "idb-keyval";
import type { VectorStore } from "./embeddings/cache";
import type { EvalCase, EvalRun } from "./evaluation/types";
import type { AnswerSettings, ChunkSettings, RetrievalSettings, Workspace, WorkspaceDocument } from "./types";

export const STORAGE_VERSION = 1;

export interface PersistedSettings {
  chunking: ChunkSettings;
  retrieval: RetrievalSettings;
  answer: AnswerSettings;
  /** The user opted in to downloading the embedding model; it is loaded again on the next visit. */
  semanticEnabled: boolean;
}

export interface PersistedState {
  version: number;
  /** Missing in data saved before workspaces could be created; the store fills in defaults. */
  workspaces?: Workspace[];
  activeWorkspaceId: string;
  documents: WorkspaceDocument[];
  evalCases: EvalCase[];
  evalRuns: EvalRun[];
  settings: Partial<PersistedSettings>;
}

const KEYS = ["version", "workspaces", "activeWorkspaceId", "documents", "evalCases", "evalRuns", "settings"] as const;

let stateStore: UseStore | null = null;
let vectorStore: UseStore | null = null;

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function getStateStore() {
  stateStore ??= createStore("rag-lab-studio", "state");
  return stateStore;
}

function getVectorStore() {
  vectorStore ??= createStore("rag-lab-studio-vectors", "vectors");
  return vectorStore;
}

export async function loadState(): Promise<PersistedState | null> {
  const values = await getMany(KEYS as unknown as string[], getStateStore());
  const [version, workspaces, activeWorkspaceId, documents, evalCases, evalRuns, settings] = values;
  if (version !== STORAGE_VERSION || !Array.isArray(documents)) return null;
  return {
    version,
    workspaces: Array.isArray(workspaces) ? workspaces : undefined,
    activeWorkspaceId: typeof activeWorkspaceId === "string" ? activeWorkspaceId : "",
    documents,
    evalCases: Array.isArray(evalCases) ? evalCases : [],
    evalRuns: Array.isArray(evalRuns) ? evalRuns : [],
    settings: settings && typeof settings === "object" ? settings : {},
  };
}

export async function saveState(state: PersistedState): Promise<void> {
  await setMany(
    KEYS.map((key) => [key, state[key]] as [string, unknown]),
    getStateStore(),
  );
}

export async function clearAllData(): Promise<void> {
  await Promise.all([clear(getStateStore()), clear(getVectorStore())]);
}

export function createVectorStore(): VectorStore {
  return {
    getMany: (keys) => getMany<Float32Array>(keys, getVectorStore()),
    setMany: (entries) => setMany(entries, getVectorStore()),
  };
}

export function describeStorageError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") {
    return "Browser storage is full. Remove some documents or clear local data; changes made now will not be saved.";
  }
  return "Saving to browser storage failed, so recent changes may not survive a reload.";
}

/** Approximate bytes used and available for this site, when the browser reports it. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return usage !== undefined && quota !== undefined ? { usage, quota } : null;
  } catch {
    return null;
  }
}
