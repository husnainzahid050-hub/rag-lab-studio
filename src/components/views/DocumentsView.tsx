"use client";

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { CheckCircle2, ClipboardPaste, Eye, FileText, FolderUp, Loader2, Search, Trash2, Upload, XCircle } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmButton,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Segmented,
  Textarea,
  cn,
  type Tone,
} from "@/components/ui/primitives";
import { ACCEPT_ATTRIBUTE, KIND_LABELS, MAX_FILE_BYTES } from "@/lib/documents/extract";
import { formatBytes, formatDateTime, formatMs } from "@/lib/format";
import { useActiveWorkspace, useAppStore } from "@/lib/store";
import type { DocumentKind } from "@/lib/types";

const KIND_TONES: Record<DocumentKind, Tone> = {
  pdf: "danger",
  docx: "info",
  markdown: "accent",
  text: "neutral",
  html: "warning",
  csv: "success",
  json: "accent",
};

const FORMAT_CHIPS = ["PDF", "DOCX", "MD", "TXT", "HTML", "CSV", "JSON"];

function UploadPanel() {
  const { uploadFiles } = useEngine();
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const allUploads = useAppStore((s) => s.uploads);
  const uploads = allUploads.filter((u) => u.workspaceId === workspaceId);
  const clearUploads = useAppStore((s) => s.clearUploads);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploads.some((u) => u.status === "processing");

  const handleFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length) void uploadFiles(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed px-4 py-10 text-center transition-all",
          dragging ? "scale-[1.01] border-accent bg-accent-soft" : "border-border-strong bg-surface-2/40 hover:border-accent/50",
        )}
      >
        <span className="bg-brand shadow-glow mb-3 flex size-12 items-center justify-center rounded-2xl text-white">
          <FolderUp className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-medium">Drag and drop files here</p>
        <p className="mt-0.5 text-xs text-muted">or</p>
        <Button variant="primary" className="mt-2" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Upload documents"
          data-testid="file-input"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-1">
          {FORMAT_CHIPS.map((f) => (
            <span key={f} className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
              {f}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Up to {formatBytes(MAX_FILE_BYTES)} per file. Scanned PDFs need OCR, which is not included.</p>
      </div>

      {uploads.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium">Upload log</p>
            <Button variant="ghost" size="sm" onClick={clearUploads}>
              Clear log
            </Button>
          </div>
          <ul className="space-y-1.5" aria-live="polite">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs">
                {u.status === "processing" && <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-info" aria-hidden />}
                {u.status === "done" && <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />}
                {u.status === "error" && <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />}
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className={u.status === "error" ? "text-danger" : "text-muted"}>{u.status === "processing" ? "Extracting text…" : u.message}</p>
                  {u.warnings?.map((w) => (
                    <p key={w} className="text-warning">
                      {w}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PastePanel() {
  const { addTextDocument } = useEngine();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = addTextDocument(title, text);
    setError(problem);
    if (!problem) {
      setSaved(title.trim() || "Pasted text");
      setTitle("");
      setText("");
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Paste text">
      <Field label="Title" htmlFor="paste-title" hint="Shown as the document name in citations.">
        <Input id="paste-title" placeholder="e.g. Meeting notes, 3 March" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </Field>
      <Field label="Text" htmlFor="paste-text" hint={`${text.length.toLocaleString()} characters`}>
        <Textarea
          id="paste-text"
          rows={9}
          placeholder="Paste an article, notes, an email thread, documentation…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(null);
          }}
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Added &ldquo;{saved}&rdquo; to this workspace.</Alert>}
      <Button type="submit" variant="primary" disabled={!text.trim()}>
        <ClipboardPaste className="size-4" aria-hidden /> Add as document
      </Button>
    </form>
  );
}

export function DocumentsView() {
  const { documents } = useEngine();
  const workspace = useActiveWorkspace();
  const removeDocument = useAppStore((s) => s.removeDocument);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [filter, setFilter] = useState("");

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? documents.filter((d) => d.name.toLowerCase().includes(q)) : documents;
  }, [documents, filter]);
  const totalChars = documents.reduce((n, d) => n + d.charCount, 0);

  const removeAll = () => {
    for (const d of documents) removeDocument(d.id);
    setSelectedId(null);
  };

  return (
    <>
      <PageHeader
        icon={FileText}
        eyebrow="Build"
        title="Documents"
        description={
          <>
            Add files to <span className="font-medium text-fg">{workspace?.name}</span>. Text is extracted in your browser; files are never
            uploaded to a server.
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Add documents"
              description="Upload files or paste text"
              icon={Upload}
              actions={
                <Segmented
                  label="How to add documents"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "upload", label: "Upload" },
                    { value: "paste", label: "Paste text" },
                  ]}
                />
              }
            />
            <CardBody>{tab === "upload" ? <UploadPanel /> : <PastePanel />}</CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Library"
              description={`${documents.length} document(s) · ${totalChars.toLocaleString()} characters`}
              icon={FileText}
              actions={
                documents.length > 1 && (
                  <ConfirmButton onConfirm={removeAll} confirmLabel={`Remove all ${documents.length}?`}>
                    <Trash2 className="size-3.5" aria-hidden /> Remove all
                  </ConfirmButton>
                )
              }
            />
            {documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload a file or paste text above. Everything you add stays in this browser."
              />
            ) : (
              <>
                {documents.length > 5 && (
                  <div className="relative border-b border-border px-5 py-3">
                    <Search className="pointer-events-none absolute top-1/2 left-8 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
                    <label htmlFor="doc-filter" className="sr-only">
                      Filter documents
                    </label>
                    <Input id="doc-filter" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-full pl-8 text-xs" />
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {shown.map((doc) => (
                    <li
                      key={doc.id}
                      className={cn("flex flex-wrap items-center gap-3 px-5 py-3 transition-colors", selectedId === doc.id ? "bg-accent-soft/50" : "hover:bg-surface-2/50")}
                    >
                      <span
                        className={cn(
                          "flex h-10 w-9 shrink-0 items-center justify-center rounded-md border font-mono text-[9px] font-bold uppercase",
                          {
                            danger: "border-danger/30 bg-danger-soft text-danger",
                            info: "border-info/30 bg-info-soft text-info",
                            accent: "border-accent/30 bg-accent-soft text-accent",
                            neutral: "border-border bg-surface-2 text-muted",
                            warning: "border-warning/30 bg-warning-soft text-warning",
                            success: "border-success/30 bg-success-soft text-success",
                          }[KIND_TONES[doc.kind]],
                        )}
                        aria-hidden
                      >
                        {doc.kind === "markdown" ? "md" : doc.kind === "text" ? "txt" : doc.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <Badge tone={KIND_TONES[doc.kind]}>{KIND_LABELS[doc.kind]}</Badge>
                          {doc.origin === "sample" && <Badge tone="info">Sample</Badge>}
                          {doc.warnings.length > 0 && <Badge tone="warning">{doc.warnings.length} warning(s)</Badge>}
                          <span>
                            {doc.charCount.toLocaleString()} chars · {formatBytes(doc.sizeBytes)}
                            {doc.pageCount ? ` · ${doc.pageCount} page(s)` : ""}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => setSelectedId(doc.id)} aria-label={`View text of ${doc.name}`}>
                          <Eye className="size-3.5" aria-hidden /> View
                        </Button>
                        <ConfirmButton
                          onConfirm={() => {
                            removeDocument(doc.id);
                            if (selectedId === doc.id) setSelectedId(null);
                          }}
                          confirmLabel="Remove?"
                          aria-label={`Remove ${doc.name}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </ConfirmButton>
                      </div>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-5 py-6 text-center text-xs text-muted">No document name matches &ldquo;{filter}&rdquo;.</li>}
                </ul>
              </>
            )}
          </Card>
        </div>

        <Card className="flex max-h-[85vh] flex-col lg:sticky lg:top-20">
          <CardHeader
            title={selected ? selected.name : "Extracted text"}
            icon={Eye}
            description={
              selected
                ? `${selected.charCount.toLocaleString()} characters · added ${formatDateTime(selected.addedAt)}${
                    selected.origin === "user" ? ` · extracted in ${formatMs(selected.extractionMs)}` : ""
                  }`
                : "Select a document to inspect the text the pipeline will chunk"
            }
          />
          {selected ? (
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
              {selected.warnings.map((w) => (
                <Alert key={w} tone="warning" className="mb-3">
                  {w}
                </Alert>
              ))}
              <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed" data-testid="document-text">
                {selected.text}
              </pre>
            </div>
          ) : (
            <EmptyState icon={Eye} title="Nothing selected" description="Choose “View” on a document to see its extracted text." />
          )}
        </Card>
      </div>
    </>
  );
}
