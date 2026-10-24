"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { extractiveAnswerer } from "@/lib/answering/extractive";
import type { AnswerGenerator, AnswerResult } from "@/lib/answering/types";
import { ChunkSettingsError, chunkDocuments } from "@/lib/chunking";
import { extractDocument, DocumentError } from "@/lib/documents/extract";
import { EmbeddingCache } from "@/lib/embeddings/cache";
import { EMBEDDING_MODEL, type Embedder } from "@/lib/embeddings/types";
import { WorkerEmbedder } from "@/lib/embeddings/worker-embedder";
import { runCases, summarize } from "@/lib/evaluation/run";
import type { EvalRun } from "@/lib/evaluation/types";
import { createId } from "@/lib/ids";
import { buildBm25Index, idf, type Bm25Index } from "@/lib/retrieval/bm25";
import { EmbeddingUnavailableError, retrieve, type RetrievalResponse, type SemanticBackend } from "@/lib/retrieval/retrieve";
import { createVectorStore, isIndexedDbAvailable } from "@/lib/storage";
import { startPersistence, useAppStore } from "@/lib/store";
import type { Chunk, RetrievalMode, WorkspaceDocument } from "@/lib/types";

export interface AskResult {
  question: string;
  retrieval: RetrievalResponse;
  answer: AnswerResult;
  answerMs: number;
}

export interface IndexingProgress {
  done: number;
  total: number;
}

interface EngineValue {
  documents: WorkspaceDocument[];
  chunks: Chunk[];
  chunkError: string | null;
  lexicalIndex: Bm25Index;
  /** True when the model is loaded and every chunk has a vector. */
  semanticReady: boolean;
  embeddingProgress: IndexingProgress | null;
  embeddingIndexError: string | null;
  answerer: AnswerGenerator;
  uploadFiles(files: File[]): Promise<void>;
  search(query: string, k: number, mode: RetrievalMode): Promise<RetrievalResponse>;
  ask(question: string): Promise<AskResult>;
  runEvaluation(): Promise<EvalRun>;
  loadModel(): Promise<void>;
  unloadModel(): void;
}

const EngineContext = createContext<EngineValue | null>(null);

export function useEngine(): EngineValue {
  const value = useContext(EngineContext);
  if (!value) throw new Error("useEngine must be used inside <EngineProvider>.");
  return value;
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = fn();
  return { value, ms: performance.now() - started };
}

interface EngineProviderProps {
  children: ReactNode;
  /** Swappable for tests; defaults to the Transformers.js Web Worker. */
  createEmbedder?: () => Embedder;
  /** Skip IndexedDB persistence (used by tests). */
  persist?: boolean;
}

export function EngineProvider({ children, createEmbedder, persist = true }: EngineProviderProps) {
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);
  const allDocuments = useAppStore((s) => s.documents);
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const chunkSettings = useAppStore((s) => s.settings.chunking);
  const semanticEnabled = useAppStore((s) => s.settings.semanticEnabled);
  const embedding = useAppStore((s) => s.embedding);
  const evalCases = useAppStore((s) => s.evalCases);
  const setStage = useAppStore((s) => s.setStage);
  const setEmbedding = useAppStore((s) => s.setEmbedding);

  const embedderRef = useRef<Embedder | null>(null);
  const cacheRef = useRef<EmbeddingCache | null>(null);
  const [vectors, setVectors] = useState<ReadonlyMap<string, Float32Array>>(new Map());
  const [embeddingProgress, setEmbeddingProgress] = useState<IndexingProgress | null>(null);
  const [embeddingIndexError, setEmbeddingIndexError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => (persist ? startPersistence() : undefined), [persist]);

  const documents = useMemo(() => allDocuments.filter((d) => d.workspaceId === workspaceId), [allDocuments, workspaceId]);

  const { chunks, chunkError, chunkMs } = useMemo(() => {
    try {
      const { value, ms } = timed(() => chunkDocuments(documents, chunkSettings));
      return { chunks: value, chunkError: null, chunkMs: ms };
    } catch (error) {
      const message = error instanceof ChunkSettingsError ? error.message : "Chunking failed unexpectedly.";
      return { chunks: [] as Chunk[], chunkError: message, chunkMs: 0 };
    }
  }, [documents, chunkSettings]);

  const { lexicalIndex, indexMs } = useMemo(() => {
    const { value, ms } = timed(() => buildBm25Index(chunks));
    return { lexicalIndex: value, indexMs: ms };
  }, [chunks]);

  useEffect(() => {
    if (!hydrated) return;
    const docCount = documents.length;
    const chars = documents.reduce((n, d) => n + d.charCount, 0);
    const current = useAppStore.getState().pipeline;
    if (current.ingestion.status === "idle") {
      setStage("ingestion", { status: docCount ? "done" : "idle", detail: `${docCount} document(s) in this workspace` });
    }
    if (current.extraction.status === "idle") {
      setStage("extraction", { status: docCount ? "done" : "idle", detail: `${chars.toLocaleString()} characters of text` });
    }
    if (chunkError) setStage("chunking", { status: "error", detail: chunkError });
    else setStage("chunking", { status: chunks.length ? "done" : "idle", detail: `${chunks.length} chunks (${chunkSettings.strategy}, size ${chunkSettings.size}, overlap ${chunkSettings.overlap})`, durationMs: chunkMs });
  }, [hydrated, documents, chunks, chunkError, chunkMs, chunkSettings, setStage, workspaceId]);

  const getEmbedder = useCallback(() => {
    embedderRef.current ??= createEmbedder ? createEmbedder() : new WorkerEmbedder();
    cacheRef.current ??= new EmbeddingCache(isIndexedDbAvailable() && persist ? createVectorStore() : null);
    return { embedder: embedderRef.current, cache: cacheRef.current };
  }, [createEmbedder, persist]);

  const loadModel = useCallback(async () => {
    const { embedder } = getEmbedder();
    useAppStore.getState().setSemanticEnabled(true);
    setEmbedding({ state: "loading", progress: null, loadedBytes: 0, totalBytes: 0 });
    try {
      const { device } = await embedder.load((p) =>
        setEmbedding({ state: "loading", progress: p.progress, loadedBytes: p.loadedBytes, totalBytes: p.totalBytes, file: p.file }),
      );
      setEmbedding({ state: "ready", device });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEmbedding({ state: "error", message: `The embedding model could not be loaded: ${message}` });
      embedder.dispose();
      embedderRef.current = null;
    }
  }, [getEmbedder, setEmbedding]);

  const unloadModel = useCallback(() => {
    embedderRef.current?.dispose();
    embedderRef.current = null;
    cacheRef.current?.clearMemory();
    useAppStore.getState().setSemanticEnabled(false);
    setEmbedding({ state: "off" });
    setVectors(new Map());
    setEmbeddingProgress(null);
    if (useAppStore.getState().settings.retrieval.mode === "semantic") useAppStore.getState().setRetrieval({ mode: "lexical" });
  }, [setEmbedding]);

  // Reload the model on later visits once the user has opted in.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (hydrated && semanticEnabled && !autoLoaded.current && useAppStore.getState().embedding.state === "off") {
      autoLoaded.current = true;
      void loadModel();
    }
  }, [hydrated, semanticEnabled, loadModel]);

  const modelReady = embedding.state === "ready";

  useEffect(() => {
    if (!modelReady) {
      setStage("indexing", {
        status: chunks.length ? "done" : "idle",
        detail: `BM25 index over ${chunks.length} chunks; no embeddings (model not loaded)`,
        durationMs: indexMs,
      });
      return;
    }
    const signal = { cancelled: false };
    const { embedder, cache } = getEmbedder();
    const started = performance.now();
    setStage("indexing", { status: "running", detail: `Embedding ${chunks.length} chunks with ${EMBEDDING_MODEL.label}` });
    cache
      .embed(
        embedder,
        chunks.map((c) => c.text),
        (done, total) => !signal.cancelled && setEmbeddingProgress({ done, total }),
        signal,
      )
      .then((result) => {
        if (signal.cancelled) return;
        setEmbeddingIndexError(null);
        setVectors(new Map(chunks.map((c, i) => [c.id, result[i]])));
        setStage("indexing", {
          status: "done",
          detail: `BM25 index + ${chunks.length} chunk embeddings (${EMBEDDING_MODEL.dimensions} dimensions)`,
          durationMs: indexMs + performance.now() - started,
        });
      })
      .catch((error: unknown) => {
        if (signal.cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setEmbeddingIndexError(message);
        setStage("indexing", { status: "warning", detail: `BM25 index ready; embedding failed: ${message}` });
      });
    return () => {
      signal.cancelled = true;
    };
  }, [modelReady, chunks, indexMs, getEmbedder, setStage]);

  const semanticReady = modelReady && chunks.length > 0 && chunks.every((c) => vectors.has(c.id));

  const semanticUnavailable = useCallback(() => {
    const state = useAppStore.getState().embedding.state;
    if (state === "loading") return new EmbeddingUnavailableError("The embedding model is still loading. Try again when it is ready, or use lexical search.");
    if (state === "ready") return new EmbeddingUnavailableError("Chunk embeddings are still being computed. Try again in a moment, or use lexical search.");
    return new EmbeddingUnavailableError();
  }, []);

  const semanticBackend = useCallback((): SemanticBackend | null => {
    if (!semanticReady || !embedderRef.current) return null;
    const embedder = embedderRef.current;
    return {
      embedQuery: async (q) => (await embedder.embed([q]))[0],
      vectors,
      minScore: useAppStore.getState().settings.retrieval.semanticMinScore,
    };
  }, [semanticReady, vectors]);

  const search = useCallback(
    async (query: string, k: number, mode: RetrievalMode) => {
      setStage("retrieval", { status: "running", detail: `Searching for "${query}"` });
      try {
        if (mode === "semantic" && !semanticReady) throw semanticUnavailable();
        const response = await retrieve({ query, k, mode, chunks, lexicalIndex, semantic: mode === "semantic" ? semanticBackend() : null });
        setStage("retrieval", {
          status: response.results.length ? "done" : "warning",
          detail: `${response.results.length} of top-${k} results (${mode === "semantic" ? "semantic" : "BM25 lexical"})`,
          durationMs: response.latencyMs,
        });
        return response;
      } catch (error) {
        setStage("retrieval", { status: "error", detail: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    [chunks, lexicalIndex, semanticBackend, semanticReady, semanticUnavailable, setStage],
  );

  const answerWith = useCallback(
    async (question: string, retrieval: RetrievalResponse) => {
      const embedder = retrieval.mode === "semantic" ? embedderRef.current : null;
      return extractiveAnswerer.generate({
        question,
        retrieved: retrieval.results,
        termWeight: (term) => idf(lexicalIndex, term),
        embed: embedder && semanticReady ? (texts) => embedder.embed(texts) : undefined,
      });
    },
    [semanticReady, lexicalIndex],
  );

  const ask = useCallback(
    async (question: string) => {
      const { mode, topK } = useAppStore.getState().settings.retrieval;
      const retrieval = await search(question, topK, mode);
      setStage("answering", { status: "running", detail: "Selecting evidence sentences" });
      const started = performance.now();
      try {
        const answer = await answerWith(question, retrieval);
        const answerMs = performance.now() - started;
        if (answer.status === "answered") {
          setStage("answering", { status: "done", detail: `${answer.sentences.length} sentence(s) extracted`, durationMs: answerMs });
          setStage("citations", { status: "done", detail: `${answer.citations.length} citation(s), all pointing to retrieved chunks` });
        } else {
          setStage("answering", { status: "warning", detail: "Insufficient evidence; no answer given", durationMs: answerMs });
          setStage("citations", { status: "warning", detail: "No citations, because no answer was given" });
        }
        return { question, retrieval, answer, answerMs };
      } catch (error) {
        setStage("answering", { status: "error", detail: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    [search, answerWith, setStage],
  );

  const runEvaluation = useCallback(async () => {
    const state = useAppStore.getState();
    const { mode, topK } = state.settings.retrieval;
    const cases = evalCases.filter((c) => c.workspaceId === workspaceId);
    if (mode === "semantic" && !semanticReady) throw semanticUnavailable();
    setStage("evaluation", { status: "running", detail: `Running ${cases.length} case(s)` });
    const started = performance.now();
    const startedAt = new Date().toISOString();
    const semantic = mode === "semantic" ? semanticBackend() : null;
    const results = await runCases(cases, {
      k: topK,
      docIds: new Set(documents.map((d) => d.id)),
      retrieve: (q) => retrieve({ query: q, k: topK, mode, chunks, lexicalIndex, semantic }),
      answer: answerWith,
    });
    const summary = summarize(results);
    const run: EvalRun = {
      id: createId("run"),
      workspaceId,
      startedAt,
      durationMs: performance.now() - started,
      config: {
        mode,
        topK,
        chunking: state.settings.chunking,
        chunkCount: chunks.length,
        embeddingModel: mode === "semantic" ? EMBEDDING_MODEL.id : null,
        answerer: extractiveAnswerer.label,
      },
      results,
      summary,
    };
    useAppStore.getState().addEvalRun(run);
    setStage("evaluation", {
      status: summary.validCases === 0 ? "warning" : "done",
      detail: summary.validCases ? `${summary.passed}/${summary.validCases} passed` : "No valid cases ran",
      durationMs: run.durationMs,
    });
    return run;
  }, [evalCases, workspaceId, semanticReady, semanticUnavailable, semanticBackend, documents, chunks, lexicalIndex, answerWith, setStage]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const store = useAppStore.getState();
      const targetWorkspace = store.activeWorkspaceId;
      for (const file of files) {
        const uploadId = createId("upload");
        store.upsertUpload({ id: uploadId, workspaceId: targetWorkspace, name: file.name, status: "processing" });
        setStage("ingestion", { status: "running", detail: `Reading ${file.name}` });
        setStage("extraction", { status: "running", detail: `Extracting text from ${file.name}` });
        const started = performance.now();
        try {
          const extracted = await extractDocument(file);
          const ms = performance.now() - started;
          useAppStore.getState().addDocument({
            id: createId("doc"),
            workspaceId: targetWorkspace,
            name: file.name,
            kind: extracted.kind,
            origin: "user",
            sizeBytes: file.size,
            text: extracted.text,
            charCount: extracted.text.length,
            pageCount: extracted.pageCount,
            warnings: extracted.warnings,
            extractionMs: ms,
            addedAt: new Date().toISOString(),
          });
          store.upsertUpload({
            id: uploadId,
            workspaceId: targetWorkspace,
            name: file.name,
            status: "done",
            message: `${extracted.text.length.toLocaleString()} characters extracted`,
            warnings: extracted.warnings,
          });
          setStage("ingestion", { status: "done", detail: `Accepted ${file.name} (${file.size.toLocaleString()} bytes)` });
          setStage("extraction", {
            status: extracted.warnings.length ? "warning" : "done",
            detail: extracted.warnings[0] ?? `${extracted.text.length.toLocaleString()} characters from ${file.name}`,
            durationMs: ms,
          });
        } catch (error) {
          const message = error instanceof DocumentError || error instanceof Error ? error.message : "The file could not be processed.";
          store.upsertUpload({ id: uploadId, workspaceId: targetWorkspace, name: file.name, status: "error", message });
          const stage = error instanceof DocumentError && (error.code === "unsupported" || error.code === "too_large") ? "ingestion" : "extraction";
          setStage(stage, { status: "error", detail: message });
          if (stage === "extraction") setStage("ingestion", { status: "done", detail: `Read ${file.name}` });
        }
      }
    },
    [setStage],
  );

  useEffect(() => () => embedderRef.current?.dispose(), []);

  const value: EngineValue = {
    documents,
    chunks,
    chunkError,
    lexicalIndex,
    semanticReady,
    embeddingProgress,
    embeddingIndexError,
    answerer: extractiveAnswerer,
    uploadFiles,
    search,
    ask,
    runEvaluation,
    loadModel,
    unloadModel,
  };

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}
