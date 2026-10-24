"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { CaseEditor } from "@/components/evaluation/CaseEditor";
import { SemanticPendingNotice, useSemanticPending } from "@/components/rag/SemanticPendingNotice";
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmButton, EmptyState, PageHeader, Stat, type Tone } from "@/components/ui/primitives";
import { chunkLabel } from "@/lib/chunking";
import { formatDateTime, formatMs, formatPercent, formatRatio } from "@/lib/format";
import type { CaseOutcome, EvalCase, EvalRun } from "@/lib/evaluation/types";
import { createId } from "@/lib/ids";
import { useAppStore } from "@/lib/store";

const OUTCOME: Record<CaseOutcome, { tone: Tone; label: string }> = {
  pass: { tone: "success", label: "Pass" },
  fail: { tone: "danger", label: "Fail" },
  invalid: { tone: "warning", label: "Invalid" },
  error: { tone: "danger", label: "Error" },
};

function newCase(workspaceId: string): EvalCase {
  return {
    id: createId("case"),
    workspaceId,
    origin: "user",
    question: "",
    expectedDocIds: [],
    evidencePhrases: [],
    expectedFacts: [],
    expectUnanswerable: false,
    createdAt: new Date().toISOString(),
  };
}

function RunConfig({ run }: { run: EvalRun }) {
  const c = run.config;
  return (
    <span>
      {c.mode === "semantic" ? "Semantic" : "BM25"} · k={c.topK} · {c.chunking.strategy} {c.chunking.size}/{c.chunking.overlap} · {c.chunkCount} chunks
    </span>
  );
}

function ResultsTable({ run }: { run: EvalRun }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="border-b border-border text-muted">
          <tr>
            <th className="w-6 px-3 py-2" />
            <th className="px-2 py-2 font-medium">Outcome</th>
            <th className="px-2 py-2 font-medium">Question</th>
            <th className="px-2 py-2 text-right font-medium">P@{run.config.topK}</th>
            <th className="px-2 py-2 text-right font-medium">R@{run.config.topK}</th>
            <th className="px-2 py-2 text-right font-medium">RR</th>
            <th className="px-3 py-2 text-right font-medium">Retrieval</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {run.results.map((r) => {
            const expanded = open === r.caseId;
            return (
              <Fragment key={r.caseId}>
                <tr className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(expanded ? null : r.caseId)}>
                  <td className="px-3 py-2">
                    <button type="button" aria-expanded={expanded} aria-label={`Details for ${r.question || "case"}`} className="text-muted">
                      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex gap-1">
                      <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
                      <Badge tone={r.origin === "sample" ? "info" : "accent"}>{r.origin === "sample" ? "Sample" : "Yours"}</Badge>
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-2 py-2">{r.question || <em className="text-muted">empty</em>}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatRatio(r.precisionAtK)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatRatio(r.recallAtK)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatRatio(r.reciprocalRank)}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.outcome === "invalid" ? "–" : formatMs(r.retrievalMs)}</td>
                </tr>
                {expanded && (
                  <tr className="bg-surface-2">
                    <td />
                    <td colSpan={6} className="space-y-3 px-2 py-3">
                      {r.reasons.length > 0 && (
                        <ul className="list-disc pl-4 text-danger">
                          {r.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      )}
                      {r.retrieved.length > 0 && (
                        <div>
                          <p className="mb-1 font-medium">Retrieved chunks</p>
                          <ol className="space-y-0.5">
                            {r.retrieved.map((item, i) => (
                              <li key={item.chunkId} className="flex gap-2 font-mono">
                                <span>#{i + 1}</span>
                                <span className="min-w-0 truncate">
                                  {item.docName} · {chunkLabel({ index: item.chunkIndex })}
                                </span>
                                <span className="text-muted">{item.score.toFixed(3)}</span>
                                {item.relevant ? <Badge tone="success">relevant</Badge> : <Badge>not relevant</Badge>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {r.answerStatus && (
                        <div>
                          <p className="mb-1 font-medium">System answer</p>
                          <p className="text-muted">{r.answerStatus === "answered" ? r.answerText : "Declined: insufficient evidence."}</p>
                        </div>
                      )}
                      {(r.factsFound.length > 0 || r.factsMissing.length > 0) && (
                        <p>
                          Facts found: {r.factsFound.join(", ") || "none"}
                          {r.factsMissing.length > 0 && <span className="text-danger"> · missing: {r.factsMissing.join(", ")}</span>}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EvaluationView() {
  const { runEvaluation, documents, chunks } = useEngine();
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const allCases = useAppStore((s) => s.evalCases);
  const allRuns = useAppStore((s) => s.evalRuns);
  const saveEvalCase = useAppStore((s) => s.saveEvalCase);
  const removeEvalCase = useAppStore((s) => s.removeEvalCase);
  const clearEvalRuns = useAppStore((s) => s.clearEvalRuns);
  const { mode, topK } = useAppStore((s) => s.settings.retrieval);
  const cases = allCases.filter((c) => c.workspaceId === workspaceId);
  const runs = allRuns.filter((r) => r.workspaceId === workspaceId);
  const latest = runs[0];

  const [editing, setEditing] = useState<EvalCase | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const semanticPending = useSemanticPending();

  const onRun = async () => {
    setError(null);
    setRunning(true);
    try {
      await runEvaluation();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Evaluation"
        description="Define questions with known evidence, run them through retrieval and answering, and measure the results. Change chunking or retrieval settings and run again to compare."
        actions={
          <Button variant="primary" onClick={onRun} disabled={running || semanticPending || cases.length === 0 || chunks.length === 0}>
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
            Run {cases.length} case(s)
          </Button>
        }
      />

      <p className="-mt-3 mb-6 text-xs text-muted">
        Next run will use: {mode === "semantic" ? "semantic retrieval" : "BM25 lexical retrieval"}, top-{topK}, current chunking settings. Change
        these in Settings and Chunking.
      </p>

      <SemanticPendingNotice />
      {error && (
        <Alert tone="danger" title="Evaluation could not run" className="mb-6">
          {error}
        </Alert>
      )}

      {latest ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Latest run {formatDateTime(latest.startedAt)}</span>·<RunConfig run={latest} />·<span>{formatMs(latest.durationMs)} total</span>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Pass rate" value={formatPercent(latest.summary.passRate)} hint={`${latest.summary.passed}/${latest.summary.validCases} valid cases`} />
            <Stat label={`Mean precision@${latest.config.topK}`} value={formatRatio(latest.summary.meanPrecisionAtK)} />
            <Stat label={`Mean recall@${latest.config.topK}`} value={formatRatio(latest.summary.meanRecallAtK)} />
            <Stat label="MRR" value={formatRatio(latest.summary.meanReciprocalRank)} />
            <Stat label="Mean retrieval" value={formatMs(latest.summary.meanRetrievalMs)} hint={`p95 ${formatMs(latest.summary.p95RetrievalMs)}`} />
            <Stat label="Not run" value={latest.summary.invalid} hint="invalid cases" />
          </div>
          <Card className="mb-6">
            <CardHeader title="Case results" description="Click a row for retrieved chunks, relevance judgements and the answer" />
            <ResultsTable run={latest} />
          </Card>
        </>
      ) : (
        <Card className="mb-6">
          <EmptyState
            icon={ClipboardCheck}
            title="No evaluation has been run in this workspace"
            description="No metrics are shown until a run has actually happened. Add test cases below, then press Run."
          />
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Test cases"
            description={`${cases.length} case(s) in this workspace`}
            actions={
              !editing && (
                <Button size="sm" onClick={() => setEditing(newCase(workspaceId))}>
                  <Plus className="size-3.5" aria-hidden /> Add test case
                </Button>
              )
            }
          />
          {editing && (
            <CardBody className="border-b border-border">
              <CaseEditor
                key={editing.id}
                initial={editing}
                documents={documents}
                onCancel={() => setEditing(null)}
                onSave={(c) => {
                  saveEvalCase(c);
                  setEditing(null);
                }}
              />
            </CardBody>
          )}
          {cases.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No test cases" description="A test case is a question plus the evidence that should be retrieved for it." />
          ) : (
            <ul className="divide-y divide-border">
              {cases.map((c) => {
                const docNames = c.expectedDocIds.map((id) => documents.find((d) => d.id === id)?.name ?? "missing document");
                return (
                  <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{c.question}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
                        <Badge tone={c.origin === "sample" ? "info" : "accent"}>{c.origin === "sample" ? "Sample case" : "Your case"}</Badge>
                        {c.expectUnanswerable ? (
                          <Badge tone="warning">Expect: decline</Badge>
                        ) : (
                          <>
                            {docNames.map((n) => (
                              <Badge key={n}>{n}</Badge>
                            ))}
                            {c.evidencePhrases.map((p) => (
                              <Badge key={p} tone="neutral">
                                &ldquo;{p}&rdquo;
                              </Badge>
                            ))}
                          </>
                        )}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.question}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <ConfirmButton onConfirm={() => removeEvalCase(c.id)} confirmLabel="Delete?" aria-label={`Delete ${c.question}`}>
                      <Trash2 className="size-3.5" />
                    </ConfirmButton>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Run history"
              description="Compare settings across runs"
              actions={runs.length > 0 && <ConfirmButton onConfirm={() => clearEvalRuns(workspaceId)} confirmLabel="Clear history?">Clear</ConfirmButton>}
            />
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {runs.map((run) => (
                  <li key={run.id} className="px-4 py-2.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted">{formatDateTime(run.startedAt)}</span>
                      <span className="font-mono font-medium">{formatPercent(run.summary.passRate)} pass</span>
                    </div>
                    <p className="mt-0.5 text-muted">
                      <RunConfig run={run} />
                    </p>
                    <p className="mt-0.5 font-mono">
                      P {formatRatio(run.summary.meanPrecisionAtK)} · R {formatRatio(run.summary.meanRecallAtK)} · MRR{" "}
                      {formatRatio(run.summary.meanReciprocalRank)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="How the metrics are computed" />
            <CardBody className="space-y-3 text-xs text-muted">
              <p>
                <span className="font-medium text-fg">Relevant chunk:</span> a retrieved chunk from an expected document that contains at
                least one evidence phrase (if phrases are given).
              </p>
              <p>
                <span className="font-mono text-fg">Precision@k = relevant chunks in top k ÷ k</span>. Fewer than k results still divide by k.
              </p>
              <p>
                <span className="font-mono text-fg">Recall@k = evidence items found in top k ÷ all evidence items</span>. Items are the
                evidence phrases, or the expected documents if no phrases are listed.
              </p>
              <p>
                <span className="font-mono text-fg">RR = 1 ÷ rank of the first relevant chunk</span> (0 if none). MRR is the mean over cases.
              </p>
              <p>
                <span className="font-medium text-fg">Pass:</span> recall@k is 1, the system answered, and every expected fact appears in the
                answer. Unanswerable cases pass only if the system declines. Pass rate = passed ÷ cases that ran (errors count as failures).
              </p>
              <p>
                Latency is measured with <span className="font-mono">performance.now()</span> in this browser. These metrics judge retrieval
                and simple fact matching; they do not measure overall answer quality the way a human reviewer would.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
