"use client";

import { SearchX } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { chunkLabel } from "@/lib/chunking";
import { SCORE_SHORT_LABELS, formatMs, formatScore } from "@/lib/format";
import type { RetrievalResponse, RetrievedChunk } from "@/lib/retrieval/retrieve";
import { uniqueTerms } from "@/lib/text/tokenize";
import { HighlightTerms } from "./Highlight";

const PREVIEW_CHARS = 320;

const EMPTY_HELP = {
  lexical: "No chunk shares a word with the query. Lexical search only matches words, so try different wording or AI search.",
  semantic: "No chunk reached the minimum cosine similarity set in Settings.",
  hybrid: "Neither keyword nor embedding search found a match above the minimum similarity.",
} as const;

export function ResultList({
  response,
  onInspect,
  otherRanks,
}: {
  response: RetrievalResponse;
  onInspect: (result: RetrievedChunk) => void;
  /** Rank of the same chunk in a second result list, for side-by-side comparison. */
  otherRanks?: ReadonlyMap<string, number>;
}) {
  const scoreLabel = SCORE_SHORT_LABELS[response.mode];
  const terms = response.mode === "semantic" ? [] : uniqueTerms(response.query);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        {response.results.length} result(s) · top-{response.k} · retrieved in {formatMs(response.latencyMs)}
        {response.unindexedChunks > 0 && ` · ${response.unindexedChunks} chunk(s) not embedded yet were skipped`}
      </p>
      {response.results.length === 0 ? (
        <EmptyState icon={SearchX} title="No relevant chunks found" description={EMPTY_HELP[response.mode]} />
      ) : (
        <ol className="space-y-3">
          {response.results.map((r) => {
            const other = otherRanks?.get(r.chunk.id);
            const preview = r.chunk.text.length > PREVIEW_CHARS ? `${r.chunk.text.slice(0, PREVIEW_CHARS)}…` : r.chunk.text;
            return (
              <li key={r.chunk.id} className="overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-lift" data-testid="retrieval-result">
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/40 px-3.5 py-2 text-[11px]">
                  <span className="bg-brand flex size-5 items-center justify-center rounded-md font-mono text-[10px] font-bold text-white">{r.rank}</span>
                  <Badge tone={response.mode === "lexical" ? "neutral" : "accent"} title={`${scoreLabel} score`}>
                    {scoreLabel} {formatScore(r.score, response.mode)}
                  </Badge>
                  {r.fusion && (
                    <span className="font-mono text-muted" title="Rank in the keyword list and in the embedding list before fusion">
                      BM25 {r.fusion.lexicalRank ? `#${r.fusion.lexicalRank}` : "–"} · vector {r.fusion.semanticRank ? `#${r.fusion.semanticRank}` : "–"}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-muted">
                    {r.chunk.docName} · {chunkLabel(r.chunk)}
                  </span>
                  {otherRanks && <Badge tone={other ? "success" : "neutral"}>{other ? `#${other} in other list` : "only here"}</Badge>}
                  <Button size="sm" variant="ghost" className="ml-auto h-6" onClick={() => onInspect(r)}>
                    Inspect
                  </Button>
                </div>
                <p className="whitespace-pre-wrap break-words px-3.5 py-2.5 text-[13px] leading-relaxed">
                  <HighlightTerms text={preview} terms={terms} />
                </p>
                {r.matchedTerms && r.matchedTerms.length > 0 && (
                  <p className="px-3.5 pb-2.5 text-[11px] text-muted">
                    Matched terms: <span className="font-mono">{r.matchedTerms.join(", ")}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
