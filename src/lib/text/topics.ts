import type { Bm25Index } from "../retrieval/bm25";
import { idf } from "../retrieval/bm25";
import { isStopword, stem } from "./tokenize";

/** Frequent but uninformative words that make poor topic suggestions. */
const WEAK_WORDS = new Set(
  "must shall might may also used using use uses include includes including within between every each other another their there these those than then into onto upon whether while where which".split(" "),
);

/**
 * Picks words that characterise the indexed documents: terms that occur in several chunks
 * but not in most of them, ranked by total frequency × IDF. Returns readable surface forms
 * ("refunds", not the stem "refund") so they can be offered as question starters.
 */
export function topTopics(index: Bm25Index, limit = 8): string[] {
  const n = index.docs.length;
  if (n === 0) return [];
  const totals = new Map<string, number>();
  for (const doc of index.docs) for (const [term, tf] of doc.termFreq) totals.set(term, (totals.get(term) ?? 0) + tf);

  const minDf = n >= 4 ? 2 : 1;
  const ranked = [...index.docFreq.entries()]
    .filter(([term, df]) => df >= minDf && df <= Math.max(1, n * 0.6) && term.length >= 4 && !/\d/.test(term))
    .map(([term]) => ({ term, score: (totals.get(term) ?? 0) * idf(index, term) }))
    .sort((a, b) => b.score - a.score || (a.term < b.term ? -1 : 1))
    .slice(0, limit * 3);

  const wanted = new Set(ranked.map((r) => r.term));
  const surface = new Map<string, Map<string, number>>();
  for (const doc of index.docs) {
    for (const match of doc.chunk.text.matchAll(/[\p{L}]+/gu)) {
      const word = match[0].toLowerCase();
      if (isStopword(word) || WEAK_WORDS.has(word)) continue;
      const s = stem(word);
      if (!wanted.has(s)) continue;
      const forms = surface.get(s) ?? new Map<string, number>();
      forms.set(word, (forms.get(word) ?? 0) + 1);
      surface.set(s, forms);
    }
  }

  const out: string[] = [];
  for (const { term } of ranked) {
    const forms = surface.get(term);
    if (!forms) continue;
    const best = [...forms.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    if (!out.includes(best)) out.push(best);
    if (out.length >= limit) break;
  }
  return out;
}
