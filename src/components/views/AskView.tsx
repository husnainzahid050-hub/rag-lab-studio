"use client";

import { useState, type FormEvent } from "react";
import { BookOpenCheck, Loader2, MessageSquareQuote, SearchX } from "lucide-react";
import { useEngine, type AskResult } from "@/components/engine/EngineProvider";
import { ChunkInspector, type InspectTarget } from "@/components/rag/ChunkInspector";
import { SemanticPendingNotice, useSemanticPending } from "@/components/rag/SemanticPendingNotice";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { chunkLabel } from "@/lib/chunking";
import { formatMs, formatScore } from "@/lib/format";
import { EmbeddingUnavailableError } from "@/lib/retrieval/retrieve";
import { SAMPLE_WORKSPACE_ID } from "@/lib/sample/documents";
import { useAppStore } from "@/lib/store";
import { uniqueTerms } from "@/lib/text/tokenize";

const SAMPLE_QUESTIONS = [
  "How many days of paid annual leave do full-time employees get?",
  "How long does refund processing take?",
  "What grind size does the French press need?",
  "Who founded the company?",
];

export function AskView() {
  const { ask, chunks, answerer } = useEngine();
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const { mode, topK } = useAppStore((s) => s.settings.retrieval);
  const setRetrieval = useAppStore((s) => s.setRetrieval);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<{ message: string; modelMissing: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspect, setInspect] = useState<InspectTarget | null>(null);
  const semanticPending = useSemanticPending();

  const run = async (q: string) => {
    setError(null);
    setLoading(true);
    try {
      setResult(await ask(q));
    } catch (err) {
      setResult(null);
      setError({ message: err instanceof Error ? err.message : String(err), modelMissing: err instanceof EmbeddingUnavailableError });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(question);
  };

  const terms = result ? uniqueTerms(result.question) : [];
  const answer = result?.answer;
  const citedIds = new Set(answer?.citations.map((c) => c.chunkId));

  return (
    <>
      <PageHeader
        title="Ask"
        description={
          <>
            Questions are answered only from your documents: the system retrieves the top {topK} chunks ({mode === "semantic" ? "semantic" : "BM25 lexical"}{" "}
            retrieval) and quotes the sentences that cover the question. No language model generates text.
          </>
        }
      />

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="ask-question" className="sr-only">
              Question
            </label>
            <Input
              id="ask-question"
              placeholder="Ask a question about the documents in this workspace"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={loading || semanticPending || !question.trim() || chunks.length === 0}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageSquareQuote className="size-4" aria-hidden />}
              Ask
            </Button>
          </form>
          {workspaceId === SAMPLE_WORKSPACE_ID && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-xs text-muted">Try:</span>
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading || semanticPending}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                  onClick={() => {
                    setQuestion(q);
                    void run(q);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <SemanticPendingNotice />
      {chunks.length === 0 && <Alert tone="info">This workspace has no documents to answer from. Add documents first.</Alert>}

      {error && (
        <Alert tone="danger" title="Could not answer" className="mb-6">
          {error.message}
          {error.modelMissing && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                setRetrieval({ mode: "lexical" });
                setError(null);
              }}
            >
              Use lexical retrieval instead
            </Button>
          )}
        </Alert>
      )}

      {result && answer && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader
              title="Answer"
              description={`“${result.question}”`}
              actions={
                <>
                  <Badge tone="info" title={answerer.description}>
                    {answer.method} · no LLM
                  </Badge>
                </>
              }
            />
            <CardBody>
              {answer.status === "answered" ? (
                <div className="space-y-2.5 text-[15px] leading-relaxed" data-testid="answer">
                  {answer.sentences.map((s, i) => {
                    const citation = answer.citations.find((c) => c.marker === s.citationMarker)!;
                    const retrieved = result.retrieval.results.find((r) => r.chunk.id === citation.chunkId)!;
                    return (
                      <p key={i}>
                        <span>&ldquo;{s.text}&rdquo;</span>{" "}
                        <button
                          type="button"
                          className="rounded bg-accent-soft px-1 align-super font-mono text-[11px] font-semibold text-accent hover:bg-accent hover:text-accent-fg"
                          aria-label={`Citation ${citation.marker}: ${citation.docName}, chunk ${citation.chunkIndex + 1}`}
                          onClick={() =>
                            setInspect({
                              chunk: retrieved.chunk,
                              sentence: { start: s.start, end: s.end },
                              terms,
                              score: { value: retrieved.score, label: result.retrieval.mode === "semantic" ? "Cosine similarity" : "BM25 score" },
                            })
                          }
                        >
                          [{citation.marker}]
                        </button>
                      </p>
                    );
                  })}
                  <p className="pt-2 text-xs text-muted">
                    Each sentence is quoted verbatim from the cited chunk. Evidence score is the share of question terms the sentence
                    contains{answer.method.includes("embedding") ? ", averaged with its embedding similarity to the question" : ""}.
                  </p>
                </div>
              ) : (
                <div data-testid="insufficient-evidence">
                  <Alert tone="warning" title="Not enough evidence in the documents">
                    {answer.reason}
                  </Alert>
                  <p className="mt-3 text-xs text-muted">
                    The system does not guess. The closest retrieved chunks are listed on the right so you can check them yourself.
                  </p>
                </div>
              )}
              <p className="mt-4 font-mono text-[11px] text-muted">
                retrieval {formatMs(result.retrieval.latencyMs)} · answer assembly {formatMs(result.answerMs)}
              </p>
            </CardBody>
          </Card>

          <div className="space-y-6">
            {answer.status === "answered" && (
              <Card>
                <CardHeader title="Citations" description="Click to open the source chunk" />
                <ul className="divide-y divide-border">
                  {answer.citations.map((c) => {
                    const retrieved = result.retrieval.results.find((r) => r.chunk.id === c.chunkId)!;
                    return (
                      <li key={c.marker}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
                          onClick={() =>
                            setInspect({
                              chunk: retrieved.chunk,
                              terms,
                              score: { value: c.retrievalScore, label: result.retrieval.mode === "semantic" ? "Cosine similarity" : "BM25 score" },
                            })
                          }
                        >
                          <span className="font-mono text-xs font-semibold text-accent">[{c.marker}]</span>
                          <span className="min-w-0 text-xs">
                            <span className="block truncate font-medium">{c.docName}</span>
                            <span className="text-muted">
                              {chunkLabel({ index: c.chunkIndex })} · retrieval rank #{c.retrievalRank} · score{" "}
                              {formatScore(c.retrievalScore, result.retrieval.mode)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <Card>
              <CardHeader title="Retrieved chunks" description={`Top ${result.retrieval.k}, ${result.retrieval.mode === "semantic" ? "semantic" : "BM25 lexical"}`} />
              {result.retrieval.results.length === 0 ? (
                <EmptyState icon={SearchX} title="Nothing retrieved" description="No chunk matched the question." />
              ) : (
                <ul className="divide-y divide-border">
                  {result.retrieval.results.map((r) => (
                    <li key={r.chunk.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-surface-2"
                        onClick={() =>
                          setInspect({
                            chunk: r.chunk,
                            terms,
                            score: { value: r.score, label: result.retrieval.mode === "semantic" ? "Cosine similarity" : "BM25 score" },
                          })
                        }
                      >
                        <span className="font-mono">#{r.rank}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {r.chunk.docName} · {chunkLabel(r.chunk)}
                        </span>
                        {citedIds.has(r.chunk.id) && (
                          <Badge tone="success">
                            <BookOpenCheck className="size-3" aria-hidden /> cited
                          </Badge>
                        )}
                        <span className="font-mono text-muted">{formatScore(r.score, result.retrieval.mode)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {!result && !error && chunks.length > 0 && (
        <Card>
          <EmptyState icon={MessageSquareQuote} title="Ask your first question" description="The answer, its citations and the retrieved chunks will appear here." />
        </Card>
      )}

      {inspect && <ChunkInspector target={inspect} onClose={() => setInspect(null)} />}
    </>
  );
}
