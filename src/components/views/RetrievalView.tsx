"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { ChunkInspector, type InspectTarget } from "@/components/rag/ChunkInspector";
import { ResultList } from "@/components/rag/ResultList";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, cn } from "@/components/ui/primitives";
import { SCORE_DESCRIPTIONS, TOP_K_LIMITS, validateTopK, type RetrievalResponse, type RetrievedChunk } from "@/lib/retrieval/retrieve";
import { useAppStore } from "@/lib/store";
import { uniqueTerms } from "@/lib/text/tokenize";

type ViewMode = "lexical" | "semantic" | "compare";

const MODE_LABELS: Record<ViewMode, string> = { lexical: "Lexical (BM25)", semantic: "Semantic (embeddings)", compare: "Compare both" };

export function RetrievalView() {
  const { search, semanticReady, chunks } = useEngine();
  const defaultK = useAppStore((s) => s.settings.retrieval.topK);
  const preferredMode = useAppStore((s) => s.settings.retrieval.mode);
  const [query, setQuery] = useState("");
  const [k, setK] = useState(String(defaultK));
  const [mode, setMode] = useState<ViewMode>(preferredMode === "semantic" && semanticReady ? "semantic" : "lexical");
  const [results, setResults] = useState<{ lexical?: RetrievalResponse; semantic?: RetrievalResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspect, setInspect] = useState<InspectTarget | null>(null);

  const effectiveMode: ViewMode = mode !== "lexical" && !semanticReady ? "lexical" : mode;
  const kError = validateTopK(Number(k));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (kError) return;
    setLoading(true);
    try {
      const n = Number(k);
      if (effectiveMode === "compare") {
        const [lexical, semantic] = await Promise.all([search(query, n, "lexical"), search(query, n, "semantic")]);
        setResults({ lexical, semantic });
      } else {
        const response = await search(query, n, effectiveMode);
        setResults({ [effectiveMode]: response });
      }
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openInspector = (r: RetrievedChunk, response: RetrievalResponse) =>
    setInspect({
      chunk: r.chunk,
      terms: response.mode === "lexical" ? uniqueTerms(response.query) : [],
      score: { value: r.score, label: response.mode === "semantic" ? "Cosine similarity" : "BM25 score" },
    });

  const ranks = (response?: RetrievalResponse) => new Map(response?.results.map((r) => [r.chunk.id, r.rank]) ?? []);

  return (
    <>
      <PageHeader
        title="Retrieval inspector"
        description="Run a query against the chunk index and see exactly which chunks come back, in what order, and why."
      />

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[1fr_110px]">
            <Field label="Query" htmlFor="retrieval-query">
              <Input
                id="retrieval-query"
                placeholder="e.g. how often should the espresso machine be descaled"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
            <Field label="Top-k" htmlFor="retrieval-k" error={kError}>
              <Input
                id="retrieval-k"
                type="number"
                min={TOP_K_LIMITS.min}
                max={TOP_K_LIMITS.max}
                value={k}
                aria-invalid={Boolean(kError)}
                onChange={(e) => setK(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <div role="radiogroup" aria-label="Retrieval mode" className="inline-flex rounded-md border border-border p-0.5">
                {(Object.keys(MODE_LABELS) as ViewMode[]).map((m) => {
                  const disabled = m !== "lexical" && !semanticReady;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={effectiveMode === m}
                      disabled={disabled}
                      onClick={() => setMode(m)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40",
                        effectiveMode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                      )}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  );
                })}
              </div>
              <Button type="submit" variant="primary" disabled={loading || chunks.length === 0} className="ml-auto">
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
                Search
              </Button>
            </div>
            {!semanticReady && (
              <p className="text-xs text-muted md:col-span-2">
                Semantic search needs the embedding model.{" "}
                <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
                  Load it in Settings
                </Link>{" "}
                (about 50 MB including the runtime, cached after the first load). Lexical search works without it.
              </p>
            )}
          </form>
        </CardBody>
      </Card>

      {error && (
        <Alert tone="danger" title="Search failed" className="mb-6">
          {error}
        </Alert>
      )}

      {chunks.length === 0 && <Alert tone="info">This workspace has no chunks yet. Add documents first.</Alert>}

      {results ? (
        <div className={cn("grid gap-6", results.lexical && results.semantic && "lg:grid-cols-2")}>
          {(["lexical", "semantic"] as const).map((m) => {
            const response = results[m];
            if (!response) return null;
            const other = m === "lexical" ? results.semantic : results.lexical;
            return (
              <Card key={m}>
                <CardHeader title={m === "lexical" ? "Lexical results (BM25)" : "Semantic results (cosine similarity)"} description={SCORE_DESCRIPTIONS[m]} />
                <CardBody>
                  <ResultList response={response} onInspect={(r) => openInspector(r, response)} otherRanks={other ? ranks(other) : undefined} />
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        !error &&
        chunks.length > 0 && (
          <Card>
            <EmptyState icon={Search} title="No search yet" description="Enter a query to see the ranked chunks and their scores." />
          </Card>
        )
      )}

      {inspect && <ChunkInspector target={inspect} onClose={() => setInspect(null)} />}
    </>
  );
}
