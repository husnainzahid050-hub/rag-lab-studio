"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Cpu,
  Database,
  Download,
  FileDown,
  FileUp,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmButton,
  Field,
  Input,
  PageHeader,
  ProgressBar,
  Select,
  cn,
} from "@/components/ui/primitives";
import { STRICTNESS_THRESHOLDS } from "@/lib/answering/extractive";
import { EMBEDDING_MODEL } from "@/lib/embeddings/types";
import { formatBytes } from "@/lib/format";
import { TOP_K_LIMITS, validateTopK } from "@/lib/retrieval/retrieve";
import { SAMPLE_WORKSPACE_ID } from "@/lib/sample/documents";
import { estimateStorage } from "@/lib/storage";
import { useAppStore } from "@/lib/store";
import { RETRIEVAL_MODE_LABELS, usesEmbeddings, type AnswerStrictness, type RetrievalMode, type Workspace } from "@/lib/types";
import { BundleError, exportWorkspace, parseWorkspaceBundle } from "@/lib/workspace-io";

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

function WorkspaceRow({ workspace }: { workspace: Workspace }) {
  const activeId = useAppStore((s) => s.activeWorkspaceId);
  const documents = useAppStore((s) => s.documents);
  const evalCases = useAppStore((s) => s.evalCases);
  const rename = useAppStore((s) => s.renameWorkspace);
  const remove = useAppStore((s) => s.deleteWorkspace);
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const docs = documents.filter((d) => d.workspaceId === workspace.id);
  const cases = evalCases.filter((c) => c.workspaceId === workspace.id);
  const active = workspace.id === activeId;

  const onRename = (e: FormEvent) => {
    e.preventDefault();
    rename(workspace.id, name);
    setEditing(false);
  };

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-5 py-3", active && "bg-accent-soft/40")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-brand text-white" : "bg-surface-2 text-muted")}>
        <FolderOpen className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={onRename} className="flex gap-1.5">
            <label htmlFor={`rename-${workspace.id}`} className="sr-only">
              Workspace name
            </label>
            <Input id={`rename-${workspace.id}`} autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs text-sm" />
            <Button type="submit" size="sm" variant="primary" disabled={!name.trim()} aria-label="Save name">
              <Check className="size-3.5" aria-hidden />
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-2 truncate text-sm font-medium">
            {workspace.name}
            {active && <Badge tone="accent">Active</Badge>}
            {workspace.origin === "sample" && <Badge tone="info">Sample</Badge>}
          </p>
        )}
        <p className="mt-0.5 text-[11px] text-muted">
          {docs.length} document(s) · {cases.length} test case(s) · {docs.reduce((n, d) => n + d.charCount, 0).toLocaleString()} characters
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!active && (
          <Button size="sm" onClick={() => setActive(workspace.id)}>
            Open
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label={`Rename ${workspace.name}`}>
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Export ${workspace.name}`}
          onClick={() => downloadJson(`${slug(workspace.name)}.rag-workspace.json`, exportWorkspace(workspace.name, docs, cases))}
        >
          <FileDown className="size-3.5" aria-hidden /> Export
        </Button>
        <ConfirmButton onConfirm={() => remove(workspace.id)} confirmLabel="Delete workspace?" aria-label={`Delete ${workspace.name}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </ConfirmButton>
      </div>
    </li>
  );
}

function WorkspacesCard() {
  const workspaces = useAppStore((s) => s.workspaces);
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const importWorkspace = useAppStore((s) => s.importWorkspace);
  const resetSample = useAppStore((s) => s.resetSampleWorkspace);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSample = workspaces.some((w) => w.id === SAMPLE_WORKSPACE_ID);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createWorkspace(name);
    setMessage({ tone: "success", text: `Created and opened "${name.trim()}".` });
    setName("");
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bundle = parseWorkspaceBundle(JSON.parse(await file.text()));
      importWorkspace(bundle);
      setMessage({ tone: "success", text: `Imported "${bundle.workspace.name}" with ${bundle.documents.length} document(s) and ${bundle.evalCases.length} test case(s).` });
    } catch (error) {
      const text = error instanceof BundleError ? error.message : error instanceof SyntaxError ? "The file is not valid JSON." : "The backup could not be imported.";
      setMessage({ tone: "danger", text });
    }
  };

  return (
    <Card id="workspaces" className="scroll-mt-20">
      <CardHeader
        title="Workspaces"
        description="Keep separate document collections. Export one as a JSON backup and import it on another device."
        icon={FolderOpen}
        actions={
          <>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-3.5" aria-hidden /> Import backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Import workspace backup"
              onChange={(e) => {
                void onImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        }
      />
      <ul className="divide-y divide-border">
        {workspaces.map((w) => (
          <WorkspaceRow key={w.id} workspace={w} />
        ))}
      </ul>
      <CardBody className="space-y-3 border-t border-border">
        <form onSubmit={onCreate} className="flex flex-wrap gap-2">
          <label htmlFor="settings-new-workspace" className="sr-only">
            New workspace name
          </label>
          <Input
            id="settings-new-workspace"
            placeholder="New workspace name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs min-w-0 flex-1"
          />
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            <Plus className="size-4" aria-hidden /> Create workspace
          </Button>
          {!hasSample && (
            <Button
              onClick={() => {
                resetSample();
                setMessage({ tone: "success", text: "The sample workspace was restored." });
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> Restore sample workspace
            </Button>
          )}
        </form>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </CardBody>
    </Card>
  );
}

function ModelCard() {
  const { loadModel, unloadModel, semanticReady, embeddingProgress, embeddingIndexError, chunks } = useEngine();
  const embedding = useAppStore((s) => s.embedding);

  return (
    <Card>
      <CardHeader
        title="AI embedding model (optional)"
        description="Enables semantic and hybrid search: meaning-based retrieval with real sentence embeddings computed in your browser"
        icon={Cpu}
      />
      <CardBody className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-2/40 p-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">Model</dt>
            <dd className="font-mono break-all">{EMBEDDING_MODEL.id}</dd>
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
            <Button variant="primary" onClick={() => void loadModel({ switchToHybrid: true })}>
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

        <p className="text-xs leading-relaxed text-muted">
          Loading it switches Ask and Evaluation to hybrid search. The model weights come from the Hugging Face Hub and the ONNX Runtime
          WebAssembly file from this site; the browser caches both, so later visits load faster. Inference uses extra memory on top of the
          download, so it can fail on low-memory phones; lexical search keeps working either way. The tokenizer cuts input at{" "}
          {EMBEDDING_MODEL.maxTokens} word pieces, and the model was trained on inputs of up to {EMBEDDING_MODEL.trainedTokens}, so very long
          chunks are represented less faithfully.
        </p>
      </CardBody>
    </Card>
  );
}

const STRICTNESS_OPTIONS: { value: AnswerStrictness; title: string; text: string }[] = [
  { value: "strict", title: "Strict", text: "Only answers with very strong evidence. Fewest wrong answers." },
  { value: "balanced", title: "Balanced", text: "Default. Needs half of the question's weighted words in one sentence." },
  { value: "lenient", title: "Lenient", text: "Answers more questions, including loosely related ones. Check the citations." },
];

function RetrievalCard() {
  const { semanticReady } = useEngine();
  const retrieval = useAppStore((s) => s.settings.retrieval);
  const strictness = useAppStore((s) => s.settings.answer.strictness);
  const setRetrieval = useAppStore((s) => s.setRetrieval);
  const setAnswer = useAppStore((s) => s.setAnswer);
  const [k, setK] = useState(String(retrieval.topK));
  const [minScore, setMinScore] = useState(String(retrieval.semanticMinScore));
  const kError = validateTopK(Number(k));
  const minScoreValue = Number(minScore);
  const minScoreError = minScore === "" || !Number.isFinite(minScoreValue) || minScoreValue < -1 || minScoreValue > 1 ? "Enter a number between -1 and 1." : null;

  return (
    <Card>
      <CardHeader title="Retrieval and answers" description="Used by Ask and Evaluation. The Retrieval page lets you override mode and top-k per search." icon={SlidersHorizontal} />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Mode"
            htmlFor="settings-mode"
            hint={semanticReady ? "Hybrid usually finds the most relevant chunks." : "Load the AI model to enable semantic and hybrid modes."}
          >
            <Select id="settings-mode" value={retrieval.mode} onChange={(e) => setRetrieval({ mode: e.target.value as RetrievalMode })}>
              {(["lexical", "semantic", "hybrid"] as const).map((m) => (
                <option key={m} value={m} disabled={usesEmbeddings(m) && !semanticReady}>
                  {RETRIEVAL_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Top-k" htmlFor="settings-k" error={kError} hint={`${TOP_K_LIMITS.min}–${TOP_K_LIMITS.max} chunks per question`}>
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
          <Field label="Minimum cosine similarity" htmlFor="settings-min-score" error={minScoreError} hint="Semantic matches below this are dropped.">
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
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-medium">Answer strictness</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {STRICTNESS_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "cursor-pointer rounded-xl border p-3 transition-colors",
                  strictness === o.value ? "border-accent bg-accent-soft/60 ring-2 ring-accent/15" : "border-border hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="strictness"
                  value={o.value}
                  checked={strictness === o.value}
                  onChange={() => setAnswer({ strictness: o.value })}
                  className="sr-only"
                />
                <span className="flex items-center justify-between text-sm font-medium">
                  {o.title}
                  <span className="font-mono text-[11px] text-muted">≥ {STRICTNESS_THRESHOLDS[o.value]}</span>
                </span>
                <span className="mt-1 block text-xs text-muted">{o.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  );
}

function StorageCard() {
  const storage = useAppStore((s) => s.storage);
  const documents = useAppStore((s) => s.documents);
  const clearLocalData = useAppStore((s) => s.clearLocalData);
  const { unloadModel } = useEngine();
  const [message, setMessage] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void estimateStorage().then((e) => !cancelled && setEstimate(e));
    return () => {
      cancelled = true;
    };
  }, [documents]);

  return (
    <Card>
      <CardHeader title="Local data" description="Where your data lives" icon={Database} />
      <CardBody className="space-y-4 text-sm">
        <p className="text-[13px] leading-relaxed text-muted">
          Documents, extracted text, settings, test cases, evaluation runs and cached embeddings are stored in this browser&rsquo;s
          IndexedDB. Nothing is uploaded to a server. Data does not sync between browsers or devices, and clearing your browser&rsquo;s site
          data deletes it. Use workspace export for backups.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          Storage status:
          {storage.state === "ok" && <Badge tone="success">Saving to IndexedDB</Badge>}
          {storage.state === "pending" && <Badge>Opening…</Badge>}
          {(storage.state === "unavailable" || storage.state === "error") && <Badge tone="warning">{storage.message}</Badge>}
          {estimate && (
            <span className="text-muted">
              · this site uses {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} available (browser estimate)
            </span>
          )}
        </div>
        {message && <Alert tone="success">{message}</Alert>}
        <ConfirmButton
          size="md"
          onConfirm={async () => {
            unloadModel();
            await clearLocalData();
            setMessage("All locally stored documents, workspaces, test cases, runs and cached embeddings were deleted. The sample workspace was re-created.");
          }}
          confirmLabel="Delete everything?"
        >
          <Trash2 className="size-4" aria-hidden /> Clear all local data
        </ConfirmButton>
      </CardBody>
    </Card>
  );
}

export function SettingsView() {
  return (
    <>
      <PageHeader icon={Settings} eyebrow="System" title="Settings" description="Workspaces, retrieval, the optional AI model and local storage." />
      <div className="space-y-6">
        <WorkspacesCard />
        <ModelCard />
        <RetrievalCard />
        <StorageCard />
      </div>
    </>
  );
}
