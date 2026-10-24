"use client";

import Link from "next/link";
import { Combine, Cpu, Loader2, Type } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { useEngine } from "@/components/engine/EngineProvider";
import { useAppStore } from "@/lib/store";

const SHORT = { lexical: "Lexical", semantic: "Semantic", hybrid: "Hybrid" } as const;
const DETAIL = { lexical: " · BM25", semantic: " · MiniLM", hybrid: " · BM25 + MiniLM" } as const;
const ICON = { lexical: Type, semantic: Cpu, hybrid: Combine } as const;

/** Shows which retrieval method answers questions right now, and whether the model is loading. */
export function RetrievalModeBadge() {
  const mode = useAppStore((s) => s.settings.retrieval.mode);
  const embedding = useAppStore((s) => s.embedding);
  const { semanticReady, embeddingProgress } = useEngine();

  let modelBadge = null;
  if (embedding.state === "loading") modelBadge = <Badge tone="warning"><Loader2 className="size-3 animate-spin" aria-hidden /> Loading model</Badge>;
  else if (embedding.state === "error") modelBadge = <Badge tone="danger">Model failed</Badge>;
  else if (embedding.state === "ready" && !semanticReady && embeddingProgress) {
    modelBadge = (
      <Badge tone="warning">
        Embedding {embeddingProgress.done}/{embeddingProgress.total}
      </Badge>
    );
  }

  const Icon = ICON[mode];
  const needsModel = mode !== "lexical";
  const ready = !needsModel || semanticReady;
  return (
    <Link href="/settings" className="flex items-center gap-2" aria-label="Retrieval mode, open settings">
      {modelBadge && <span className="hidden sm:inline-flex">{modelBadge}</span>}
      <Badge tone={!needsModel ? "neutral" : ready ? "accent" : "warning"} className="px-2 py-1">
        <Icon className="size-3" aria-hidden /> {SHORT[mode]}
        <span className="hidden sm:inline">{DETAIL[mode]}</span>
        {ready ? "" : " (not ready)"}
      </Badge>
    </Link>
  );
}
