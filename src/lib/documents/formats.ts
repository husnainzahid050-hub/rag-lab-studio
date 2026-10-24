/**
 * Converters from structured text formats to retrieval-friendly plain text. Each output
 * separates records with blank lines so the sentence splitter treats every record as a unit.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = "p|div|section|article|header|footer|main|aside|nav|li|ul|ol|table|tr|h[1-6]|blockquote|pre|figure|figcaption|dt|dd";

/** Visible text of an HTML document. Scripts, styles and comments are dropped; nothing is ever executed or rendered. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(td|th)\b[^>]*>/gi, " ")
      .replace(new RegExp(`</?(${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n");
}

/** RFC 4180-style CSV parsing: quoted fields, escaped quotes ("") and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** One paragraph per data row: "Row 3. Name: Ali; City: Lahore." The first row is treated as the header. */
export function csvToText(text: string): { text: string; rows: number } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { text: "", rows: 0 };
  if (rows.length === 0) return { text: header.join(", "), rows: 0 };
  const names = header.map((h, i) => h.trim() || `Column ${i + 1}`);
  const paragraphs = rows.map((cells, r) => {
    const pairs = cells
      .map((value, i) => [names[i] ?? `Column ${i + 1}`, value.trim()] as const)
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}: ${value}`);
    return `Row ${r + 1}. ${pairs.join("; ")}.`;
  });
  return { text: paragraphs.join("\n\n"), rows: rows.length };
}

/** One paragraph per leaf value with its path, e.g. "orders[0].status: shipped". */
export function jsonToText(value: unknown, maxLines = 20000): { text: string; truncated: boolean } {
  const lines: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (lines.length >= maxLines) return;
    if (Array.isArray(node)) node.forEach((item, i) => walk(item, `${path}[${i}]`));
    else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key);
    } else lines.push(`${path || "value"}: ${String(node)}`);
  };
  walk(value, "");
  return { text: lines.join("\n\n"), truncated: lines.length >= maxLines };
}
