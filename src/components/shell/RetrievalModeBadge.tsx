"use client";

import Link from "next/link";
import { Cpu, Type } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { useEngine } from "@/components/engine/EngineProvider";
import { useAppStore } from "@/lib/store";

/** Shows which retrieval method answers questions right now, and whether the model is loading. */
export function RetrievalModeBadge() {
  const mode = useAppStore((s) => s.settings.retrieval.mode);
  const embedding = useAppStore((s) => s.embedding);
  const { semanticReady, embeddingProgress } = useEngine();

  let modelBadge = null;
  if (embedding.state === "loading") modelBadge = <Badge tone="warning">Loading model…</Badge>;
  else if (embedding.state === "error") modelBadge = <Badge tone="danger">Model failed</Badge>;
  else if (embedding.state === "ready" && !semanticReady && embeddingProgress) {
    modelBadge = (
      <Badge tone="warning">
        Embedding {embeddingProgress.done}/{embeddingProgress.total}
      </Badge>
    );
  }

  return (
    <Link href="/settings" className="flex items-center gap-2" aria-label="Retrieval mode, open settings">
      {modelBadge && <span className="hidden sm:inline-flex">{modelBadge}</span>}
      {mode === "semantic" ? (
        <Badge tone={semanticReady ? "accent" : "warning"}>
          <Cpu className="size-3" aria-hidden /> Semantic<span className="hidden sm:inline"> · MiniLM</span>
          {semanticReady ? "" : " (not ready)"}
        </Badge>
      ) : (
        <Badge tone="neutral">
          <Type className="size-3" aria-hidden /> Lexical<span className="hidden sm:inline"> · BM25</span>
        </Badge>
      )}
    </Link>
  );
}
