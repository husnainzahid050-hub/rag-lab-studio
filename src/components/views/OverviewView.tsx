"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useEngine } from "@/components/engine/EngineProvider";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat, cn, type Tone } from "@/components/ui/primitives";
import { formatMs, formatPercent } from "@/lib/format";
import { STAGES, type StageStatus } from "@/lib/pipeline";
import { WORKSPACES, useAppStore } from "@/lib/store";

const STATUS: Record<StageStatus, { tone: Tone; label: string; icon: typeof Circle }> = {
  idle: { tone: "neutral", label: "Not run", icon: Circle },
  running: { tone: "info", label: "Running", icon: Loader2 },
  done: { tone: "success", label: "Done", icon: CheckCircle2 },
  warning: { tone: "warning", label: "Attention", icon: AlertTriangle },
  error: { tone: "danger", label: "Error", icon: XCircle },
};

const STEPS = [
  { href: "/documents", title: "Add or inspect documents", text: "Upload .txt, .md or .pdf files and check the extracted text." },
  { href: "/chunking", title: "Tune chunking", text: "Change chunk size and overlap and watch the chunks change." },
  { href: "/retrieval", title: "Search", text: "See which chunks a query retrieves and how they are scored." },
  { href: "/ask", title: "Ask a question", text: "Get an extractive answer with clickable citations." },
  { href: "/evaluation", title: "Evaluate", text: "Run test cases and measure precision, recall and MRR." },
];

export function OverviewView() {
  const { documents, chunks, semanticReady } = useEngine();
  const pipeline = useAppStore((s) => s.pipeline);
  const workspaceId = useAppStore((s) => s.activeWorkspaceId);
  const lastRun = useAppStore((s) => s.evalRuns.find((r) => r.workspaceId === workspaceId));
  const workspace = WORKSPACES.find((w) => w.id === workspaceId);
  const chars = documents.reduce((n, d) => n + d.charCount, 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={
          <>
            The state of every RAG stage in <span className="font-medium text-fg">{workspace?.name}</span>. Statuses and timings come
            from what actually ran in this browser session; stages you have not used yet show &ldquo;Not run&rdquo;.
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Documents" value={documents.length} />
        <Stat label="Characters" value={chars.toLocaleString()} />
        <Stat label="Chunks" value={chunks.length} />
        <Stat label="Index" value={semanticReady ? "BM25 + vectors" : "BM25"} hint={semanticReady ? "Semantic search available" : "Lexical only"} />
        <Stat
          label="Last evaluation"
          value={lastRun?.summary.passRate != null ? formatPercent(lastRun.summary.passRate) : "Not run"}
          hint={lastRun ? `${lastRun.summary.passed}/${lastRun.summary.validCases} cases passed` : "Run it on the Evaluation page"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader title="RAG stages" description="From raw file to evaluated answer" />
          <ol className="divide-y divide-border">
            {STAGES.map((stage, i) => {
              const state = pipeline[stage.id];
              const meta = STATUS[state.status];
              const Icon = meta.icon;
              return (
                <li key={stage.id} className="flex gap-3 px-4 py-3" data-testid={`stage-${stage.id}`}>
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
                      state.status === "idle" ? "border-border text-muted" : "border-transparent bg-surface-2",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{stage.label}</p>
                      <Badge tone={meta.tone}>
                        <Icon className={cn("size-3", state.status === "running" && "animate-spin")} aria-hidden />
                        {meta.label}
                      </Badge>
                      {state.durationMs !== undefined && <span className="font-mono text-[11px] text-muted">{formatMs(state.durationMs)}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{stage.description}</p>
                    {state.detail && state.status !== "idle" && (
                      <p className={cn("mt-1 text-xs", state.status === "error" ? "text-danger" : "text-fg")}>{state.detail}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Walk through the lab" />
          <CardBody className="space-y-1 p-2">
            {STEPS.map((step, i) => (
              <Link key={step.href} href={step.href} className="group flex gap-3 rounded-md p-2 hover:bg-surface-2">
                <span className="font-mono text-xs text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {step.title}
                    <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className="block text-xs text-muted">{step.text}</span>
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
