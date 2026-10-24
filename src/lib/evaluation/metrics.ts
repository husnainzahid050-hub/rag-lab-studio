/**
 * Retrieval metrics over a ranked list of relevance judgements, where
 * `relevant[i]` says whether the result at rank i + 1 is relevant.
 */

/** Precision@k = (relevant results in the top k) / k. Missing results count as not relevant. */
export function precisionAtK(relevant: boolean[], k: number): number {
  if (!Number.isInteger(k) || k <= 0) throw new Error("k must be a positive whole number.");
  return relevant.slice(0, k).filter(Boolean).length / k;
}

/**
 * Recall@k = (evidence units found in the top k) / (all evidence units).
 * Returns null when there is no ground truth, because recall is undefined then.
 */
export function recallAtK(found: number, total: number): number | null {
  if (total === 0) return null;
  if (found < 0 || found > total) throw new Error("Found evidence must be between 0 and the total.");
  return found / total;
}

/** Reciprocal rank = 1 / (rank of the first relevant result), or 0 if none is relevant. */
export function reciprocalRank(relevant: boolean[]): number {
  const index = relevant.indexOf(true);
  return index === -1 ? 0 : 1 / (index + 1);
}

/** Arithmetic mean of the defined values; null if there are none. */
export function mean(values: (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (defined.length === 0) return null;
  return defined.reduce((a, b) => a + b, 0) / defined.length;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}
