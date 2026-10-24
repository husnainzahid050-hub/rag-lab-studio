"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BookOpenCheck, Check, ChevronDown, Copy, Loader2, MessageSquareQuote, SearchX, SendHorizontal, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useEngine, type AskResult } from "@/components/engine/EngineProvider";
import { ChunkInspector, type InspectTarget } from "@/components/rag/ChunkInspector";
import { SemanticPendingNotice, useSemanticPending } from "@/components/rag/SemanticPendingNotice";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Segmented, cn } from "@/components/ui/primitives";
import { STRICTNESS_THRESHOLDS } from "@/lib/answering/extractive";
import { chunkLabel } from "@/lib/chunking";
import { SCORE_NAMES, formatMs, formatScore } from "@/lib/format";
import type { RetrievedChunk } from "@/lib/retrieval/retrieve";
import { EmbeddingUnavailableError } from "@/lib/retrieval/retrieve";
import { SAMPLE_WORKSPACE_ID } from "@/lib/sample/documents";
import { useAppStore } from "@/lib/store";
import { topTopics } from "@/lib/text/topics";
import { uniqueTerms } from "@/lib/text/tokenize";
import { RETRIEVAL_MODE_LABELS, type AnswerStrictness } from "@/lib/types";

const SAMPLE_QUESTIONS = [
  "How many days of paid annual leave do full-time employees get?",
  "How long does refund processing take?",
  "What grind size does the French press need?",
  "Who founded the company?",
];

const STRICTNESS_HELP: Record<AnswerStrictness, string> = {
  strict: "Answers only with very strong evidence",
  balanced: "Default trade-off",
  lenient: "Answers more questions; check the citations",
};

type Turn = { id: number; question: string } & ({ status: "pending" } | { status: "done"; result: AskResult } | { status: "error"; message: string; modelMissing: boolean });

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Copy answer"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function AnswerTurn({ result, latest, onInspect }: { result: AskResult; latest: boolean; onInspect: (t: InspectTarget) => void }) {
  const [showChunks, setShowChunks] = useState(false);
  const { answer, retrieval } = result;
  const terms = uniqueTerms(result.question);
  const scoreName = SCORE_NAMES[retrieval.mode];
  const citedIds = new Set(answer.citations.map((c) => c.chunkId));
  const find = (chunkId: string) => retrieval.results.find((r) => r.chunk.id === chunkId)!;
  const inspectChunk = (r: RetrievedChunk, sentence?: { start: number; end: number }) =>
    onInspect({ chunk: r.chunk, sentence, terms, score: { value: r.score, label: scoreName } });
  const copyText =
    answer.status === "answered"
      ? `${answer.sentences.map((s) => `${s.text} [${s.citationMarker}]`).join(" ")}\n\n${answer.citations.map((c) => `[${c.marker}] ${c.docName}, ${chunkLabel({ index: c.chunkIndex })}`).join("\n")}`
      : "";

  return (
    <div className="flex gap-3">
      <span className="bg-brand mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-white" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <Card className="min-w-0 flex-1 overflow-hidden">
        <div className="px-5 py-4">
          {answer.status === "answered" ? (
            <div className="space-y-2.5 text-[15px] leading-relaxed" data-testid={latest ? "answer" : undefined}>
              {answer.sentences.map((s, i) => {
                const citation = answer.citations.find((c) => c.marker === s.citationMarker)!;
                return (
                  <p key={i}>
                    <span>&ldquo;{s.text}&rdquo;</span>{" "}
                    <button
                      type="button"
                      className="bg-brand rounded-md px-1.5 py-0.5 align-super font-mono text-[10px] font-semibold text-white hover:brightness-110"
                      aria-label={`Citation ${citation.marker}: ${citation.docName}, chunk ${citation.chunkIndex + 1}`}
                      onClick={() => inspectChunk(find(citation.chunkId), { start: s.start, end: s.end })}
                    >
                      {citation.marker}
                    </button>
                  </p>
                );
              })}
            </div>
          ) : (
            <div data-testid={latest ? "insufficient-evidence" : undefined} className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="font-medium">Not enough evidence in the documents</p>
                <p className="mt-1 text-sm text-muted">{answer.reason}</p>
                <p className="mt-1 text-xs text-muted">
                  Nothing is guessed. Check the closest chunks below, rephrase, or try the Lenient setting.
                </p>
              </div>
            </div>
          )}

          {answer.status === "answered" && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {answer.citations.map((c) => (
                <button
                  key={c.marker}
                  type="button"
                  onClick={() => inspectChunk(find(c.chunkId))}
                  className="flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2 py-1 text-left text-xs hover:border-accent/40 hover:bg-accent-soft"
                >
                  <span className="bg-brand flex size-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold text-white">{c.marker}</span>
                  <span className="truncate font-medium">{c.docName}</span>
                  <span className="shrink-0 text-muted">{chunkLabel({ index: c.chunkIndex })}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/40 px-4 py-2 text-[11px] text-muted">
          <Badge tone="info">{answer.method} · no LLM</Badge>
          <span className="font-mono">
            {RETRIEVAL_MODE_LABELS[retrieval.mode]} · retrieval {formatMs(retrieval.latencyMs)} · answer {formatMs(result.answerMs)}
          </span>
          <span className="ml-auto flex gap-1">
            {copyText && <CopyButton text={copyText} />}
            <Button size="sm" variant="ghost" aria-expanded={showChunks} onClick={() => setShowChunks((v) => !v)}>
              <ChevronDown className={cn("size-3.5 transition-transform", showChunks && "rotate-180")} aria-hidden />
              {retrieval.results.length} retrieved chunk(s)
            </Button>
          </span>
        </div>

        {showChunks && (
          <ul className="divide-y divide-border border-t border-border">
            {retrieval.results.length === 0 && (
              <li>
                <EmptyState icon={SearchX} title="Nothing retrieved" description="No chunk matched the question." />
              </li>
            )}
            {retrieval.results.map((r) => (
              <li key={r.chunk.id}>
                <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-surface-2" onClick={() => inspectChunk(r)}>
                  <span className="font-mono">#{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.chunk.docName} · {chunkLabel(r.chunk)}
                  </span>
                  {citedIds.has(r.chunk.id) && (
                    <Badge tone="success">
                      <BookOpenCheck className="size-3" aria-hidden /> cited
                    </Badge>
                  )}
                  <span className="font-mono text-muted">{formatScore(r.score, retrieval.mode)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function AskView() {
  const { ask, chunks, lexicalIndex } = useEngine();
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const { mode, topK } = useAppStore((s) => s.settings.retrieval);
  const strictness = useAppStore((s) => s.settings.answer.strictness);
  const setAnswer = useAppStore((s) => s.setAnswer);
  const setRetrieval = useAppStore((s) => s.setRetrieval);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Record<string, Turn[]>>({});
  const [inspect, setInspect] = useState<InspectTarget | null>(null);
  const semanticPending = useSemanticPending();
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const turns = history[workspaceId] ?? [];
  const loading = turns.some((t) => t.status === "pending");
  const topics = useMemo(() => (workspaceId === SAMPLE_WORKSPACE_ID ? [] : topTopics(lexicalIndex, 8)), [lexicalIndex, workspaceId]);
  const lastTurnId = turns.at(-1)?.id;

  useEffect(() => {
    if (lastTurnId !== undefined) endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [lastTurnId, turns.length]);

  const setTurns = (update: (t: Turn[]) => Turn[]) => setHistory((h) => ({ ...h, [workspaceId]: update(h[workspaceId] ?? []) }));

  const run = async (q: string) => {
    const text = q.trim();
    if (!text || loading) return;
    const id = nextId.current++;
    setQuestion("");
    setTurns((t) => [...t, { id, question: text, status: "pending" }]);
    try {
      const result = await ask(text);
      setTurns((t) => t.map((turn) => (turn.id === id ? { id, question: text, status: "done", result } : turn)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTurns((t) =>
        t.map((turn) => (turn.id === id ? { id, question: text, status: "error", message, modelMissing: err instanceof EmbeddingUnavailableError } : turn)),
      );
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(question);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void run(question);
    }
  };

  const suggestions =
    workspaceId === SAMPLE_WORKSPACE_ID
      ? SAMPLE_QUESTIONS.map((q) => ({ label: q, question: q }))
      : topics.map((t) => ({ label: t, question: `What do the documents say about ${t}?` }));

  return (
    <>
      <PageHeader
        icon={MessageSquareQuote}
        eyebrow="Query"
        title="Ask"
        description={`Answers are quoted from your documents, never generated. Top ${topK} chunks · ${RETRIEVAL_MODE_LABELS[mode]}.`}
        actions={
          turns.length > 0 && (
            <Button size="sm" onClick={() => setTurns(() => [])} disabled={loading}>
              <Trash2 className="size-3.5" aria-hidden /> Clear chat
            </Button>
          )
        }
      />

      <SemanticPendingNotice />
      {chunks.length === 0 && (
        <Alert tone="info" className="mb-6">
          This workspace has no documents to answer from. Add documents first.
        </Alert>
      )}

      <div className="space-y-5 pb-4">
        {turns.length === 0 && chunks.length > 0 && (
          <Card className="bg-hero">
            <EmptyState
              icon={MessageSquareQuote}
              title="Ask anything about your documents"
              description="Each answer quotes the exact sentences it is based on. Click a number to open the source."
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 px-6 pb-8">
                <span className="w-full text-center text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {workspaceId === SAMPLE_WORKSPACE_ID ? "Try" : "Topics in your documents"}
                </span>
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={loading || semanticPending}
                    className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow-card transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    onClick={() => void run(s.question)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="animate-fade-up space-y-3">
            <div className="flex justify-end">
              <p className="bg-brand max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white shadow-glow">{turn.question}</p>
            </div>
            {turn.status === "pending" && (
              <div className="flex items-center gap-2 pl-11 text-sm text-muted" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Retrieving chunks and selecting evidence…
              </div>
            )}
            {turn.status === "error" && (
              <div className="pl-11">
                <Alert tone="danger" title="Could not answer">
                  {turn.message}
                  {turn.modelMissing && (
                    <Button size="sm" className="mt-2" onClick={() => setRetrieval({ mode: "lexical" })}>
                      Use lexical retrieval instead
                    </Button>
                  )}
                </Alert>
              </div>
            )}
            {turn.status === "done" && <AnswerTurn result={turn.result} latest={turn.id === lastTurnId} onInspect={setInspect} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-bg via-bg via-85% to-transparent px-4 pt-8 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {turns.length > 0 && suggestions.length > 0 && (
          <div className="scrollbar-thin mb-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Suggested questions">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={loading || semanticPending}
                className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                onClick={() => void run(s.question)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-2 shadow-lift focus-within:border-accent/60">
          <label htmlFor="ask-question" className="sr-only">
            Question
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="ask-question"
              rows={1}
              placeholder={chunks.length ? "Ask a question about your documents…  (Enter to send, Shift+Enter for a new line)" : "Add documents to start asking"}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              className="max-h-40 min-h-10 w-full resize-none bg-transparent px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:outline-none"
            />
            <Button type="submit" variant="primary" disabled={loading || semanticPending || !question.trim() || chunks.length === 0} aria-label="Ask">
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
              <span className="hidden sm:inline">Ask</span>
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-border px-1 pt-2">
            <span className="text-[11px] text-muted">Answer strictness</span>
            <Segmented
              label="Answer strictness"
              value={strictness}
              onChange={(v) => setAnswer({ strictness: v })}
              options={(["strict", "balanced", "lenient"] as const).map((s) => ({
                value: s,
                label: s[0].toUpperCase() + s.slice(1),
                title: `${STRICTNESS_HELP[s]} (evidence ≥ ${STRICTNESS_THRESHOLDS[s]})`,
              }))}
            />
          </div>
        </form>
      </div>

      {inspect && <ChunkInspector target={inspect} onClose={() => setInspect(null)} />}
    </>
  );
}
