import type { RetrievalMode } from "./types";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "–";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatRatio(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return `${Math.round(value * 100)}%`;
}

export function formatScore(score: number, mode: RetrievalMode): string {
  if (mode === "hybrid") return score.toFixed(4);
  return mode === "semantic" ? score.toFixed(3) : score.toFixed(2);
}

/** Short label shown next to a score, e.g. "BM25 5.42". */
export const SCORE_SHORT_LABELS: Record<RetrievalMode, string> = { lexical: "BM25", semantic: "cosine", hybrid: "RRF" };
/** Full name of the score, e.g. in the chunk inspector. */
export const SCORE_NAMES: Record<RetrievalMode, string> = {
  lexical: "BM25 score",
  semantic: "Cosine similarity",
  hybrid: "RRF score",
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
