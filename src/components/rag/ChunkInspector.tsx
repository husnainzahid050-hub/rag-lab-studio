"use client";

import { Badge, SidePanel } from "@/components/ui/primitives";
import { chunkLabel } from "@/lib/chunking";
import { useAppStore } from "@/lib/store";
import type { Chunk } from "@/lib/types";
import { HighlightTerms } from "./Highlight";

const CONTEXT_CHARS = 240;

export interface InspectTarget {
  chunk: Chunk;
  /** Optional sentence inside the chunk to emphasise (offsets relative to the chunk text). */
  sentence?: { start: number; end: number };
  terms?: string[];
  score?: { value: number; label: string };
}

export function ChunkInspector({ target, onClose }: { target: InspectTarget; onClose: () => void }) {
  const { chunk, sentence, terms = [], score } = target;
  const doc = useAppStore((s) => s.documents.find((d) => d.id === chunk.docId));
  const stillMatches = doc ? doc.text.slice(chunk.start, chunk.end) === chunk.text : false;

  const before = doc && stillMatches ? doc.text.slice(Math.max(0, chunk.start - CONTEXT_CHARS), chunk.start) : "";
  const after = doc && stillMatches ? doc.text.slice(chunk.end, chunk.end + CONTEXT_CHARS) : "";

  const body = sentence ? (
    <>
      <HighlightTerms text={chunk.text.slice(0, sentence.start)} terms={terms} />
      <span className="rounded bg-accent-soft px-0.5 text-fg ring-1 ring-accent/40">
        <HighlightTerms text={chunk.text.slice(sentence.start, sentence.end)} terms={terms} />
      </span>
      <HighlightTerms text={chunk.text.slice(sentence.end)} terms={terms} />
    </>
  ) : (
    <HighlightTerms text={chunk.text} terms={terms} />
  );

  return (
    <SidePanel title={`${chunk.docName} · ${chunkLabel(chunk)}`} onClose={onClose}>
      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted">Chunk ID</dt>
          <dd className="font-mono break-all">{chunk.id}</dd>
        </div>
        <div>
          <dt className="text-muted">Characters</dt>
          <dd className="font-mono">{chunk.text.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Offsets</dt>
          <dd className="font-mono">
            [{chunk.start}, {chunk.end})
          </dd>
        </div>
        {score && (
          <div>
            <dt className="text-muted">{score.label}</dt>
            <dd className="font-mono">{score.value.toFixed(3)}</dd>
          </div>
        )}
      </dl>

      {!doc && (
        <p className="mb-3 text-xs text-warning">The source document has been removed; only the stored chunk text is shown.</p>
      )}
      {doc && !stillMatches && (
        <p className="mb-3 text-xs text-warning">
          The document changed since this result was produced, so surrounding context cannot be shown.
        </p>
      )}

      <p className="mb-2 flex items-center gap-2 text-xs text-muted">
        In context <Badge>faded text is outside the chunk</Badge>
      </p>
      <div className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">
        {before && <span className="text-muted/60">{chunk.start - CONTEXT_CHARS > 0 ? "…" : ""}{before}</span>}
        <span className="text-fg">{body}</span>
        {after && <span className="text-muted/60">{after}{chunk.end + CONTEXT_CHARS < (doc?.text.length ?? 0) ? "…" : ""}</span>}
      </div>
    </SidePanel>
  );
}
