"use client";

import { useMemo, useState } from "react";
import { Scissors } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Stat } from "@/components/ui/primitives";
import { CHUNK_LIMITS, chunkLabel, overlapWithPrevious, validateChunkSettings } from "@/lib/chunking";
import { useAppStore } from "@/lib/store";
import type { Chunk, ChunkSettings, ChunkStrategy } from "@/lib/types";

const PREVIEW_LIMITS = [10, 25, 100] as const;

function ChunkMap({ chunks, length }: { chunks: Chunk[]; length: number }) {
  if (length === 0) return null;
  return (
    <div className="relative h-8 w-full overflow-hidden rounded bg-surface-2" aria-label="Chunk boundaries across the document" role="img">
      {chunks.map((c, i) => (
        <div
          key={c.id}
          title={`${chunkLabel(c)}: [${c.start}, ${c.end})`}
          className="absolute border-x border-surface"
          style={{
            left: `${(c.start / length) * 100}%`,
            width: `${((c.end - c.start) / length) * 100}%`,
            top: i % 2 === 0 ? 0 : "50%",
            height: "50%",
            background: i % 2 === 0 ? "var(--accent)" : "var(--info)",
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}

export function ChunkingView() {
  const { documents, chunks, chunkError } = useEngine();
  const settings = useAppStore((s) => s.settings.chunking);
  const setChunking = useAppStore((s) => s.setChunking);
  const [draft, setDraft] = useState<{ strategy: ChunkStrategy; size: string; overlap: string }>({
    strategy: settings.strategy,
    size: String(settings.size),
    overlap: String(settings.overlap),
  });
  const [docFilter, setDocFilter] = useState<string>("all");
  const [previewLimit, setPreviewLimit] = useState<number>(25);

  const parsed: ChunkSettings = { strategy: draft.strategy, size: Number(draft.size), overlap: Number(draft.overlap) };
  const problems = draft.size === "" || draft.overlap === "" ? ["Enter both a chunk size and an overlap."] : validateChunkSettings(parsed);

  const update = (next: Partial<typeof draft>) => {
    const merged = { ...draft, ...next };
    setDraft(merged);
    const candidate: ChunkSettings = { strategy: merged.strategy, size: Number(merged.size), overlap: Number(merged.overlap) };
    if (merged.size !== "" && merged.overlap !== "" && validateChunkSettings(candidate).length === 0) setChunking(candidate);
  };

  const visible = useMemo(() => (docFilter === "all" ? chunks : chunks.filter((c) => c.docId === docFilter)), [chunks, docFilter]);
  const sizes = visible.map((c) => c.text.length);
  const avg = sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0;
  const mapDoc = docFilter === "all" ? documents[0] : documents.find((d) => d.id === docFilter);
  const maxOverlap = Math.floor(Number(draft.size || 0) * CHUNK_LIMITS.maxOverlapRatio);

  return (
    <>
      <PageHeader
        title="Chunking"
        description="Documents are split into chunks before indexing. Retrieval returns chunks, not whole documents, so these settings decide what evidence a query can find."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Settings" description="Chunks are recomputed as soon as the values are valid" />
            <CardBody className="space-y-4">
              <Field label="Strategy" htmlFor="chunk-strategy" hint={draft.strategy === "sentence" ? "Packs whole sentences; overlap repeats whole sentences." : "Exact character windows; may cut words in half."}>
                <Select id="chunk-strategy" value={draft.strategy} onChange={(e) => update({ strategy: e.target.value as ChunkStrategy })}>
                  <option value="sentence">Sentence-aware</option>
                  <option value="fixed">Fixed size (characters)</option>
                </Select>
              </Field>
              <Field label="Chunk size (characters)" htmlFor="chunk-size" hint={`${CHUNK_LIMITS.minSize}–${CHUNK_LIMITS.maxSize}`}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={CHUNK_LIMITS.minSize}
                    max={2000}
                    step={50}
                    value={Math.min(Number(draft.size) || CHUNK_LIMITS.minSize, 2000)}
                    onChange={(e) => update({ size: e.target.value })}
                    className="flex-1 accent-[var(--accent)]"
                    aria-label="Chunk size slider"
                  />
                  <Input
                    id="chunk-size"
                    type="number"
                    inputMode="numeric"
                    className="w-24"
                    value={draft.size}
                    aria-invalid={problems.some((p) => p.startsWith("Chunk size"))}
                    onChange={(e) => update({ size: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Overlap (characters)" htmlFor="chunk-overlap" hint={`0–${maxOverlap} (at most half the size)`}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(maxOverlap, 0)}
                    step={10}
                    value={Math.min(Number(draft.overlap) || 0, maxOverlap)}
                    onChange={(e) => update({ overlap: e.target.value })}
                    className="flex-1 accent-[var(--accent)]"
                    aria-label="Overlap slider"
                  />
                  <Input
                    id="chunk-overlap"
                    type="number"
                    inputMode="numeric"
                    className="w-24"
                    value={draft.overlap}
                    aria-invalid={problems.some((p) => p.startsWith("Overlap"))}
                    onChange={(e) => update({ overlap: e.target.value })}
                  />
                </div>
              </Field>
              {problems.length > 0 && (
                <Alert tone="danger" title="Settings not applied">
                  <ul className="list-disc pl-4">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <p className="mt-1">The chunks below still use size {settings.size}, overlap {settings.overlap}.</p>
                </Alert>
              )}
              {chunkError && <Alert tone="danger">{chunkError}</Alert>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why size and overlap matter" />
            <CardBody className="space-y-2 text-[13px] text-muted">
              <p>
                <span className="font-medium text-fg">Small chunks</span> are precise: a match points at a specific passage. But a single
                chunk may not hold enough context to answer, and facts split across chunks are harder to find.
              </p>
              <p>
                <span className="font-medium text-fg">Large chunks</span> carry more context, but unrelated text dilutes the match, so
                scores get noisier. The embedding model was trained on inputs of up to 256 word pieces (roughly 1,000 characters of English) and
                cuts input at 512, so very long chunks are embedded less faithfully.
              </p>
              <p>
                <span className="font-medium text-fg">Overlap</span> repeats the end of one chunk at the start of the next, so a sentence
                near a boundary is fully contained in at least one chunk. More overlap means more chunks and more duplicate text.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Chunks" value={visible.length} />
            <Stat label="Average size" value={avg} hint="characters" />
            <Stat label="Smallest" value={sizes.length ? Math.min(...sizes) : 0} />
            <Stat label="Largest" value={sizes.length ? Math.max(...sizes) : 0} />
          </div>

          <Card>
            <CardHeader
              title="Chunk preview"
              description="Highlighted text at the start of a chunk is overlap repeated from the previous chunk"
              actions={
                <>
                  <label htmlFor="chunk-doc-filter" className="sr-only">
                    Filter by document
                  </label>
                  <Select id="chunk-doc-filter" className="h-8 w-44 text-xs" value={docFilter} onChange={(e) => setDocFilter(e.target.value)}>
                    <option value="all">All documents</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                  <label htmlFor="chunk-preview-limit" className="sr-only">
                    Number of chunks to preview
                  </label>
                  <Select id="chunk-preview-limit" className="h-8 w-32 text-xs" value={previewLimit} onChange={(e) => setPreviewLimit(Number(e.target.value))}>
                    {PREVIEW_LIMITS.map((n) => (
                      <option key={n} value={n}>
                        Show {n}
                      </option>
                    ))}
                  </Select>
                </>
              }
            />
            {visible.length === 0 ? (
              <EmptyState icon={Scissors} title="No chunks" description="Add documents to this workspace to see how they are chunked." />
            ) : (
              <CardBody className="space-y-4">
                {mapDoc && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted">
                      Boundaries in <span className="font-medium text-fg">{mapDoc.name}</span> ({mapDoc.charCount.toLocaleString()} characters)
                    </p>
                    <ChunkMap chunks={chunks.filter((c) => c.docId === mapDoc.id)} length={mapDoc.charCount} />
                  </div>
                )}
                <ol className="space-y-3" data-testid="chunk-list">
                  {visible.slice(0, previewLimit).map((chunk) => {
                    const previous = chunks[chunks.indexOf(chunk) - 1];
                    const shared = overlapWithPrevious(chunk, previous);
                    return (
                      <li key={chunk.id} className="rounded-md border border-border">
                        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] text-muted">
                          <span className="font-mono font-semibold text-fg">{chunkLabel(chunk)}</span>
                          <span className="truncate">{chunk.docName}</span>
                          <span className="font-mono">
                            [{chunk.start}, {chunk.end})
                          </span>
                          <Badge>{chunk.text.length} chars</Badge>
                          {shared > 0 && <Badge tone="accent">{shared} chars overlap</Badge>}
                        </div>
                        <p className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12.5px] leading-relaxed">
                          {shared > 0 && <span className="rounded-sm bg-overlap">{chunk.text.slice(0, shared)}</span>}
                          {chunk.text.slice(shared)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
                {visible.length > previewLimit && (
                  <p className="text-center text-xs text-muted">
                    Showing {previewLimit} of {visible.length} chunks.
                  </p>
                )}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
