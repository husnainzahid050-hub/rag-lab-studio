"use client";

import { useState } from "react";
import { Cpu, Database, Download, Loader2, Power, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmButton, Field, Input, PageHeader, ProgressBar, Select } from "@/components/ui/primitives";
import { EMBEDDING_MODEL } from "@/lib/embeddings/types";
import { formatBytes } from "@/lib/format";
import { TOP_K_LIMITS, validateTopK } from "@/lib/retrieval/retrieve";
import { useAppStore } from "@/lib/store";
import type { RetrievalMode } from "@/lib/types";

function ModelCard() {
  const { loadModel, unloadModel, semanticReady, embeddingProgress, embeddingIndexError, chunks } = useEngine();
  const embedding = useAppStore((s) => s.embedding);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Cpu className="size-4" aria-hidden /> Embedding model (optional)
          </span>
        }
        description="Enables semantic search: meaning-based retrieval with real sentence embeddings computed in your browser"
      />
      <CardBody className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">Model</dt>
            <dd className="font-mono">{EMBEDDING_MODEL.id}</dd>
          </div>
          <div>
            <dt className="text-muted">Dimensions</dt>
            <dd className="font-mono">{EMBEDDING_MODEL.dimensions}</dd>
          </div>
          <div>
            <dt className="text-muted">Download</dt>
            <dd className="font-mono">
              ≈ {EMBEDDING_MODEL.approxDownloadMb} MB model + {EMBEDDING_MODEL.runtimeWasmMb} MB runtime
            </dd>
          </div>
          <div>
            <dt className="text-muted">Runtime</dt>
            <dd className="font-mono">Transformers.js · WASM</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Status:</span>
          {embedding.state === "off" && <Badge>Not loaded</Badge>}
          {embedding.state === "loading" && <Badge tone="info">Loading</Badge>}
          {embedding.state === "ready" && <Badge tone="success">Loaded ({embedding.device})</Badge>}
          {embedding.state === "error" && <Badge tone="danger">Failed</Badge>}
          {embedding.state === "ready" && (
            <Badge tone={semanticReady ? "success" : "info"}>
              {semanticReady
                ? `${chunks.length}/${chunks.length} chunks embedded`
                : embeddingProgress
                  ? `Embedding chunks ${embeddingProgress.done}/${embeddingProgress.total}`
                  : "Preparing chunk embeddings"}
            </Badge>
          )}
        </div>

        {embedding.state === "loading" && (
          <div className="space-y-1.5">
            <ProgressBar value={embedding.progress} label="Model download progress" />
            <p className="font-mono text-[11px] text-muted">
              {embedding.totalBytes > 0
                ? `${formatBytes(embedding.loadedBytes)} of ${formatBytes(embedding.totalBytes)}${embedding.file ? ` · ${embedding.file}` : ""}`
                : "Starting download…"}
            </p>
          </div>
        )}
        {embedding.state === "ready" && !semanticReady && embeddingProgress && (
          <ProgressBar value={(embeddingProgress.done / Math.max(1, embeddingProgress.total)) * 100} label="Chunk embedding progress" />
        )}
        {embedding.state === "error" && <Alert tone="danger">{embedding.message} Lexical search keeps working.</Alert>}
        {embeddingIndexError && <Alert tone="warning">Embedding the chunks failed: {embeddingIndexError}</Alert>}

        <div className="flex flex-wrap gap-2">
          {(embedding.state === "off" || embedding.state === "error") && (
            <Button variant="primary" onClick={() => void loadModel()}>
              <Download className="size-4" aria-hidden /> {embedding.state === "error" ? "Retry loading" : "Download and load model"}
            </Button>
          )}
          {embedding.state === "loading" && (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </Button>
          )}
          {embedding.state === "ready" && (
            <Button onClick={unloadModel}>
              <Power className="size-4" aria-hidden /> Unload model
            </Button>
          )}
        </div>

        <p className="text-xs text-muted">
          The model weights come from the Hugging Face Hub and the ONNX Runtime WebAssembly file from this site; the browser caches
          both, so later visits load faster. It needs a modern browser with WebAssembly, and inference uses extra memory on top of the
          download, so it can fail on low-memory phones. Lexical search keeps working either way. The tokenizer cuts input at{" "}
          {EMBEDDING_MODEL.maxTokens} word pieces, and the model was trained on inputs of up to {EMBEDDING_MODEL.trainedTokens}, so very long
          chunks are represented less faithfully.
        </p>
      </CardBody>
    </Card>
  );
}

function RetrievalCard() {
  const { semanticReady } = useEngine();
  const retrieval = useAppStore((s) => s.settings.retrieval);
  const setRetrieval = useAppStore((s) => s.setRetrieval);
  const [k, setK] = useState(String(retrieval.topK));
  const [minScore, setMinScore] = useState(String(retrieval.semanticMinScore));
  const kError = validateTopK(Number(k));
  const minScoreValue = Number(minScore);
  const minScoreError = minScore === "" || !Number.isFinite(minScoreValue) || minScoreValue < -1 || minScoreValue > 1 ? "Enter a number between -1 and 1." : null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" aria-hidden /> Retrieval
          </span>
        }
        description="Used by Ask and Evaluation. The Retrieval page lets you override mode and top-k per search."
      />
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Mode"
          htmlFor="settings-mode"
          hint={semanticReady ? "Semantic uses cosine similarity of embeddings." : "Load the embedding model to enable semantic mode."}
        >
          <Select id="settings-mode" value={retrieval.mode} onChange={(e) => setRetrieval({ mode: e.target.value as RetrievalMode })}>
            <option value="lexical">Lexical (BM25)</option>
            <option value="semantic" disabled={!semanticReady}>
              Semantic (embeddings)
            </option>
          </Select>
        </Field>
        <Field label="Top-k" htmlFor="settings-k" error={kError} hint={`${TOP_K_LIMITS.min}–${TOP_K_LIMITS.max} chunks`}>
          <Input
            id="settings-k"
            type="number"
            value={k}
            aria-invalid={Boolean(kError)}
            onChange={(e) => {
              setK(e.target.value);
              if (!validateTopK(Number(e.target.value))) setRetrieval({ topK: Number(e.target.value) });
            }}
          />
        </Field>
        <Field label="Minimum cosine similarity" htmlFor="settings-min-score" error={minScoreError} hint="Semantic results below this are dropped.">
          <Input
            id="settings-min-score"
            type="number"
            step="0.05"
            value={minScore}
            aria-invalid={Boolean(minScoreError)}
            onChange={(e) => {
              setMinScore(e.target.value);
              const v = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(v) && v >= -1 && v <= 1) setRetrieval({ semanticMinScore: v });
            }}
          />
        </Field>
      </CardBody>
    </Card>
  );
}

function StorageCard() {
  const storage = useAppStore((s) => s.storage);
  const resetSample = useAppStore((s) => s.resetSampleWorkspace);
  const clearLocalData = useAppStore((s) => s.clearLocalData);
  const { unloadModel } = useEngine();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Database className="size-4" aria-hidden /> Local data
          </span>
        }
        description="Where your data lives"
      />
      <CardBody className="space-y-4 text-sm">
        <p className="text-[13px] text-muted">
          Documents, extracted text, settings, test cases, evaluation runs and cached embeddings are stored in this browser&rsquo;s
          IndexedDB. Nothing is uploaded to a server. Data does not sync between browsers or devices, and clearing your browser&rsquo;s site
          data deletes it.
        </p>
        <p className="flex items-center gap-2 text-xs">
          Storage status:
          {storage.state === "ok" && <Badge tone="success">Saving to IndexedDB</Badge>}
          {storage.state === "pending" && <Badge>Opening…</Badge>}
          {(storage.state === "unavailable" || storage.state === "error") && <Badge tone="warning">{storage.message}</Badge>}
        </p>
        {message && <Alert tone="success">{message}</Alert>}
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            size="md"
            onConfirm={() => {
              resetSample();
              setMessage("The sample workspace was restored to its original documents and test cases.");
            }}
            confirmLabel="Reset sample workspace?"
          >
            <RotateCcw className="size-4" aria-hidden /> Reset sample workspace
          </ConfirmButton>
          <ConfirmButton
            size="md"
            onConfirm={async () => {
              unloadModel();
              await clearLocalData();
              setMessage("All locally stored documents, test cases, runs and cached embeddings were deleted. The sample workspace was re-created.");
            }}
            confirmLabel="Delete everything?"
          >
            <Trash2 className="size-4" aria-hidden /> Clear all local data
          </ConfirmButton>
        </div>
      </CardBody>
    </Card>
  );
}

export function SettingsView() {
  return (
    <>
      <PageHeader title="Settings" description="Configure retrieval, the optional embedding model and local storage." />
      <div className="space-y-6">
        <ModelCard />
        <RetrievalCard />
        <StorageCard />
      </div>
    </>
  );
}
