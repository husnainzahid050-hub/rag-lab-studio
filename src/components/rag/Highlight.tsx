import type { ReactNode } from "react";
import { isStopword, stem } from "@/lib/text/tokenize";

/** Wraps words whose stem is in `terms` in <mark>. Text is rendered as React text nodes, never as HTML. */
export function HighlightTerms({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const wanted = new Set(terms);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = match[0].toLowerCase();
    if (isStopword(word) || !wanted.has(stem(word))) continue;
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(<mark key={index}>{match[0]}</mark>);
    last = index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
