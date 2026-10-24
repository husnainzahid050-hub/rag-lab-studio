export interface Span {
  start: number;
  end: number;
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "mr", "mrs", "ms", "dr", "vs", "no", "approx", "fig"]);

/**
 * Splits text into sentence spans. Offsets point into the original string and
 * exclude surrounding whitespace, so `text.slice(span.start, span.end)` is the
 * trimmed sentence. Blank lines and Markdown headings/list items also end a sentence.
 */
export function splitSentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;

  const push = (from: number, to: number) => {
    let s = from;
    let e = to;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) spans.push({ start: s, end: e });
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      const next = text[i + 1];
      const lineEnd = next === "\n" || next === undefined || /^[ \t]*([#>*-]|\d+[.)])\s/.test(text.slice(i + 1, i + 8));
      const prevLineIsBlock = /^[ \t]*([#>*-]|\d+[.)])\s/.test(text.slice(lineStart(text, i), i));
      if (lineEnd || prevLineIsBlock) {
        push(start, i);
        start = i + 1;
      }
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?") {
      const next = text[i + 1];
      if (next !== undefined && !/\s/.test(next) && !/["')\]]/.test(next)) continue;
      if (ch === ".") {
        const word = text.slice(start, i).split(/\s+/).pop()?.toLowerCase() ?? "";
        if (ABBREVIATIONS.has(word) || /^\d+$/.test(word)) {
          if (/^\s+[a-z\d]/.test(text.slice(i + 1, i + 3))) continue;
        }
      }
      let end = i + 1;
      while (end < text.length && /["')\]]/.test(text[end])) end++;
      push(start, end);
      start = end;
      i = end - 1;
    }
  }
  push(start, text.length);
  return spans;
}

function lineStart(text: string, newlineIndex: number): number {
  const prev = text.lastIndexOf("\n", newlineIndex - 1);
  return prev + 1;
}

export function splitSentences(text: string): string[] {
  return splitSentenceSpans(text).map((s) => text.slice(s.start, s.end));
}
