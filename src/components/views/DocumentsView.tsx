"use client";

import { useRef, useState, type DragEvent } from "react";
import { CheckCircle2, Eye, FileText, Loader2, Trash2, Upload, XCircle } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmButton, EmptyState, PageHeader, cn } from "@/components/ui/primitives";
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from "@/lib/documents/extract";
import { formatBytes, formatDateTime, formatMs } from "@/lib/format";
import { useAppStore } from "@/lib/store";

const KIND_LABEL = { text: "Text", markdown: "Markdown", pdf: "PDF" } as const;

export function DocumentsView() {
  const { documents, uploadFiles } = useEngine();
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const allUploads = useAppStore((s) => s.uploads);
  const uploads = allUploads.filter((u) => u.workspaceId === workspaceId);
  const clearUploads = useAppStore((s) => s.clearUploads);
  const removeDocument = useAppStore((s) => s.removeDocument);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = documents.find((d) => d.id === selectedId) ?? null;
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
      <PageHeader
        title="Documents"
        description="Upload documents to this workspace. Text is extracted in your browser; files are never sent to a server."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Upload" description={`Plain text, Markdown or text-based PDF, up to ${formatBytes(MAX_FILE_BYTES)} each`} />
            <CardBody>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center transition-colors",
                  dragging ? "border-accent bg-accent-soft" : "border-border-strong",
                )}
              >
                <Upload className="mb-2 size-5 text-muted" aria-hidden />
                <p className="text-sm">Drop files here or</p>
                <Button variant="primary" size="sm" className="mt-2" onClick={() => inputRef.current?.click()} disabled={busy}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  Choose files
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
                <p className="mt-3 text-[11px] text-muted">Scanned PDFs without a text layer cannot be read (no OCR).</p>
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
                      <li key={u.id} className="flex items-start gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs">
                        {u.status === "processing" && <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-info" aria-hidden />}
                        {u.status === "done" && <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />}
                        {u.status === "error" && <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.name}</p>
                          <p className={u.status === "error" ? "text-danger" : "text-muted"}>
                            {u.status === "processing" ? "Extracting text…" : u.message}
                          </p>
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
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents in this workspace" description={`${documents.length} document(s)`} />
            {documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload a file above, or switch to the Sample workspace to explore with prepared documents."
              />
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((doc) => (
                  <li key={doc.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", selectedId === doc.id && "bg-surface-2")}>
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <Badge>{KIND_LABEL[doc.kind]}</Badge>
                        {doc.origin === "sample" ? <Badge tone="info">Sample</Badge> : <Badge tone="accent">Uploaded</Badge>}
                        <Badge tone="success">Ready</Badge>
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
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex max-h-[80vh] flex-col lg:sticky lg:top-20">
          <CardHeader
            title={selected ? selected.name : "Extracted text"}
            description={
              selected
                ? `${selected.charCount.toLocaleString()} characters · added ${formatDateTime(selected.addedAt)}${
                    selected.origin === "user" ? ` · extracted in ${formatMs(selected.extractionMs)}` : ""
                  }`
                : "Select a document to inspect the text that the pipeline will chunk"
            }
          />
          {selected ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
