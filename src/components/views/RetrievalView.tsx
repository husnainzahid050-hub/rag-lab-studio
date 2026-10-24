"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { ChunkInspector, type InspectTarget } from "@/components/rag/ChunkInspector";
import { ResultList } from "@/components/rag/ResultList";
import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Segmented, cn } from "@/components/ui/primitives";
import { SCORE_NAMES } from "@/lib/format";
import { SCORE_DESCRIPTIONS, TOP_K_LIMITS, validateTopK, type RetrievalResponse, type RetrievedChunk } from "@/lib/retrieval/retrieve";
import { useAppStore } from "@/lib/store";
import { uniqueTerms } from "@/lib/text/tokenize";
import { RETRIEVAL_MODE_LABELS, type RetrievalMode } from "@/lib/types";

type ViewMode = RetrievalMode | "compare";

const VIEW_LABELS: Record<ViewMode, string> = {
  lexical: "Lexical",
  semantic: "Semantic",
  hybrid: "Hybrid",
  compare: "Compare all",
};

const RESULT_TITLES: Record<RetrievalMode, string> = {
  lexical: "Lexical · BM25",
  semantic: "Semantic · cosine similarity",
  hybrid: "Hybrid · reciprocal rank fusion",
};

export function RetrievalView() {
  const { search, semanticReady, chunks } = useEngine();
  const defaultK = useAppStore((s) => s.settings.retrieval.topK);
  const preferredMode = useAppStore((s) => s.settings.retrieval.mode);
  const [query, setQuery] = useState("");
  const [k, setK] = useState(String(defaultK));
  const [mode, setMode] = useState<ViewMode>(preferredMode);
  const [results, setResults] = useState<Partial<Record<RetrievalMode, RetrievalResponse>> | null>(null);
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
        const [lexical, semantic, hybrid] = await Promise.all([search(query, n, "lexical"), search(query, n, "semantic"), search(query, n, "hybrid")]);
        setResults({ lexical, semantic, hybrid });
      } else {
        setResults({ [effectiveMode]: await search(query, n, effectiveMode) });
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
      terms: response.mode === "semantic" ? [] : uniqueTerms(response.query),
      score: { value: r.score, label: SCORE_NAMES[response.mode] },
    });

  const shown = (["lexical", "semantic", "hybrid"] as const).filter((m) => results?.[m]);
  const ranksOf = (m: RetrievalMode) => new Map(results?.[m]?.results.map((r) => [r.chunk.id, r.rank]) ?? []);

  return (
    <>
      <PageHeader
        icon={Search}
        eyebrow="Query"
        title="Retrieval inspector"
        description="Run a query against the chunk index and see exactly which chunks come back, in what order, and why."
      />

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[1fr_110px]">
            <Field label="Query" htmlFor="retrieval-query">
              <Input id="retrieval-query" placeholder="Search your documents…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10" />
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
                className="h-10"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Segmented
                label="Retrieval mode"
                value={effectiveMode}
                onChange={setMode}
                options={(Object.keys(VIEW_LABELS) as ViewMode[]).map((m) => ({
                  value: m,
                  label: VIEW_LABELS[m],
                  disabled: m !== "lexical" && !semanticReady,
                  title: m === "compare" ? "Run all three methods side by side" : RETRIEVAL_MODE_LABELS[m],
                }))}
              />
              <Button type="submit" variant="primary" disabled={loading || chunks.length === 0} className="ml-auto">
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
                Search
              </Button>
            </div>
            {!semanticReady && (
              <p className="text-xs text-muted md:col-span-2">
                Semantic and hybrid search need the embedding model.{" "}
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
        <div className={cn("grid gap-6", shown.length === 2 && "lg:grid-cols-2", shown.length === 3 && "xl:grid-cols-3")}>
          {shown.map((m) => {
            const response = results[m]!;
            const otherMode = shown.length > 1 ? (m === "lexical" ? "semantic" : "lexical") : null;
            return (
              <Card key={m} className="min-w-0">
                <CardHeader title={RESULT_TITLES[m]} description={SCORE_DESCRIPTIONS[m]} />
                <CardBody>
                  <ResultList response={response} onInspect={(r) => openInspector(r, response)} otherRanks={otherMode ? ranksOf(otherMode) : undefined} />
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
