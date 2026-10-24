"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Cpu,
  Database,
  FileText,
  Layers,
  Loader2,
  MessageSquareQuote,
  Type,
  Upload,
  XCircle,
} from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { Badge, Card, CardHeader, Stat, buttonClassName, cn, type Tone } from "@/components/ui/primitives";
import { formatMs, formatPercent } from "@/lib/format";
import { STAGES, type StageStatus } from "@/lib/pipeline";
import { useActiveWorkspace, useAppStore } from "@/lib/store";
import { RETRIEVAL_MODE_LABELS } from "@/lib/types";

const STATUS: Record<StageStatus, { tone: Tone; label: string; icon: typeof Circle; ring: string }> = {
  idle: { tone: "neutral", label: "Not run", icon: Circle, ring: "border-border" },
  running: { tone: "info", label: "Running", icon: Loader2, ring: "border-info/50" },
  done: { tone: "success", label: "Done", icon: CheckCircle2, ring: "border-success/40" },
  warning: { tone: "warning", label: "Attention", icon: AlertTriangle, ring: "border-warning/50" },
  error: { tone: "danger", label: "Error", icon: XCircle, ring: "border-danger/50" },
};

function compactNumber(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString();
}

export function OverviewView() {
  const { documents, chunks, semanticReady } = useEngine();
  const pipeline = useAppStore((s) => s.pipeline);
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const mode = useAppStore((s) => s.settings.retrieval.mode);
  const embeddingState = useAppStore((s) => s.embedding.state);
  const lastRun = useAppStore((s) => s.evalRuns.find((r) => r.workspaceId === workspaceId));
  const caseCount = useAppStore((s) => s.evalCases.filter((c) => c.workspaceId === workspaceId).length);
  const workspace = useActiveWorkspace();
  const chars = documents.reduce((n, d) => n + d.charCount, 0);

  const steps = [
    { done: documents.length > 0, title: "Add your documents", text: "PDF, Word, Markdown, text, HTML, CSV or JSON, or paste text.", href: "/documents", icon: Upload },
    { done: semanticReady, title: "Load the AI model (optional)", text: "Enables semantic and hybrid search. About 50 MB, once.", href: "/settings", icon: Cpu },
    { done: pipeline.answering.status !== "idle", title: "Ask a question", text: "Get answers quoted from your files, with citations.", href: "/ask", icon: MessageSquareQuote },
    { done: Boolean(lastRun), title: "Measure quality", text: "Write test questions and score retrieval.", href: "/evaluation", icon: ClipboardCheck },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <>
      <section className="bg-hero relative mb-6 overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Badge tone="accent" className="mb-3">
              {workspace?.origin === "sample" ? "Sample workspace" : "Your workspace"} · {workspace?.name}
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ask your documents. <span className="text-brand">See every step.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              Upload files, watch them become searchable chunks, and get answers quoted straight from the source, with citations, an
              honest &ldquo;not enough evidence&rdquo; when the documents don&rsquo;t say, and metrics to prove it works.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/documents" className={buttonClassName(documents.length ? "secondary" : "primary", "lg")}>
              <Upload className="size-4" aria-hidden /> Add documents
            </Link>
            <Link href="/ask" className={buttonClassName(documents.length ? "primary" : "secondary", "lg")}>
              <MessageSquareQuote className="size-4" aria-hidden /> Ask a question
            </Link>
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Documents" value={documents.length} icon={FileText} />
        <Stat label="Characters" value={compactNumber(chars)} icon={Type} tone="info" />
        <Stat label="Chunks" value={chunks.length} icon={Layers} tone="accent" />
        <Stat
          label="Search"
          value={semanticReady ? "AI ready" : embeddingState === "loading" || (embeddingState === "ready" && chunks.length > 0) ? "Loading AI" : "Keyword"}
          hint={RETRIEVAL_MODE_LABELS[mode]}
          icon={Database}
          tone={semanticReady ? "success" : "neutral"}
        />
        <Stat
          label="Last evaluation"
          value={lastRun?.summary.passRate != null ? formatPercent(lastRun.summary.passRate) : "–"}
          hint={lastRun ? `${lastRun.summary.passed}/${lastRun.summary.validCases} cases passed` : `${caseCount} test case(s), not run yet`}
          icon={ClipboardCheck}
          tone={lastRun ? "success" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Pipeline" description="Live status of each stage in this browser session" icon={Layers} />
          <ol className="grid gap-3 p-4 sm:grid-cols-2">
            {STAGES.map((stage, i) => {
              const state = pipeline[stage.id];
              const meta = STATUS[state.status];
              const Icon = meta.icon;
              return (
                <li
                  key={stage.id}
                  data-testid={`stage-${stage.id}`}
                  className={cn("relative rounded-xl border bg-surface p-3.5 transition-colors", meta.ring, state.status === "idle" && "bg-surface-2/40")}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold",
                        state.status === "idle" ? "bg-surface-2 text-muted" : "bg-brand text-white",
                      )}
                    >
                      {i + 1}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{stage.label}</p>
                    <Badge tone={meta.tone}>
                      <Icon className={cn("size-3", state.status === "running" && "animate-spin")} aria-hidden />
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{stage.description}</p>
                  {state.detail && state.status !== "idle" && (
                    <p className={cn("mt-1.5 text-xs", state.status === "error" ? "text-danger" : "text-fg")}>
                      {state.detail}
                      {state.durationMs !== undefined && <span className="ml-1.5 font-mono text-[11px] text-muted">{formatMs(state.durationMs)}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Get started"
            description={`${completed} of ${steps.length} done`}
            icon={CheckCircle2}
          />
          <div className="px-5 pt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="bg-brand h-full rounded-full transition-[width]" style={{ width: `${(completed / steps.length) * 100}%` }} />
            </div>
          </div>
          <ul className="space-y-1 p-2.5">
            {steps.map((step) => (
              <li key={step.title}>
                <Link href={step.href} className="group flex gap-3 rounded-lg p-2.5 hover:bg-surface-2">
                  {step.done ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
                  ) : (
                    <step.icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("flex items-center gap-1 text-sm font-medium", step.done && "text-muted line-through decoration-muted/40")}>
                      {step.title}
                      <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </span>
                    <span className="block text-xs text-muted">{step.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
