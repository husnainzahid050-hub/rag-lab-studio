"use client";

import Link from "next/link";
import { useEngine } from "@/components/engine/EngineProvider";
import { Alert } from "@/components/ui/primitives";
import { useAppStore } from "@/lib/store";

/** True when semantic mode is selected but the model or the chunk vectors are not ready yet. */
export function useSemanticPending(): boolean {
  const mode = useAppStore((s) => s.settings.retrieval.mode);
  const { semanticReady } = useEngine();
  return mode === "semantic" && !semanticReady;
}

export function SemanticPendingNotice() {
  const pending = useSemanticPending();
  const embedding = useAppStore((s) => s.embedding);
  const setRetrieval = useAppStore((s) => s.setRetrieval);
  const { embeddingProgress } = useEngine();
  if (!pending) return null;

  let message: string;
  if (embedding.state === "loading") message = "The embedding model is loading.";
  else if (embedding.state === "ready")
    message = embeddingProgress ? `Embedding chunks (${embeddingProgress.done}/${embeddingProgress.total}).` : "Preparing chunk embeddings.";
  else if (embedding.state === "error") message = "The embedding model failed to load.";
  else message = "The embedding model is not loaded.";

  return (
    <Alert tone="warning" title="Semantic retrieval is selected but not ready" className="mb-6">
      {message} Wait for it to finish,{" "}
      <Link href="/settings" className="text-accent hover:underline">
        check Settings
      </Link>
      , or{" "}
      <button type="button" className="text-accent hover:underline" onClick={() => setRetrieval({ mode: "lexical" })}>
        switch to lexical retrieval
      </button>
      .
    </Alert>
  );
}
