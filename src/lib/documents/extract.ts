import type { DocumentKind } from "../types";
import type { DocxExtraction } from "./docx";
import { csvToText, htmlToText, jsonToText } from "./formats";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Pasted or extracted text above this size is rejected to keep the browser responsive. */
export const MAX_TEXT_CHARS = 3_000_000;
export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".pdf", ".docx", ".html", ".htm", ".csv", ".json"] as const;
export const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_EXTENSIONS,
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");
export const SUPPORTED_FORMATS_LABEL = "PDF, Word (.docx), Markdown, plain text, HTML, CSV or JSON";

export type DocumentErrorCode = "unsupported" | "too_large" | "empty" | "unreadable" | "no_text";

export class DocumentError extends Error {
  constructor(
    public readonly code: DocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface ExtractedDocument {
  kind: DocumentKind;
  text: string;
  pageCount?: number;
  warnings: string[];
}

export interface PdfExtraction {
  pages: string[];
}

export type PdfExtractor = (data: Uint8Array) => Promise<PdfExtraction>;
export type DocxExtractor = (data: Uint8Array) => Promise<DocxExtraction>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function detectKind(fileName: string, mimeType: string): DocumentKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || mimeType === DOCX_MIME) return "docx";
  if (name.endsWith(".md") || name.endsWith(".markdown") || mimeType === "text/markdown") return "markdown";
  if (name.endsWith(".html") || name.endsWith(".htm") || mimeType === "text/html") return "html";
  if (name.endsWith(".csv") || mimeType === "text/csv") return "csv";
  if (name.endsWith(".json") || mimeType === "application/json") return "json";
  if (name.endsWith(".txt") || mimeType === "text/plain") return "text";
  return null;
}

export const KIND_LABELS: Record<DocumentKind, string> = {
  text: "Text",
  markdown: "Markdown",
  pdf: "PDF",
  docx: "Word",
  html: "HTML",
  csv: "CSV",
  json: "JSON",
};

export function normalizeText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeText(bytes: Uint8Array): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("utf-8").decode(bytes);
    warnings.push("Some bytes were not valid UTF-8 and were replaced with \"�\".");
  }
  const controlChars = text.match(/[\u0000-\u0008\u000E-\u001F]/g)?.length ?? 0;
  if (text.length > 0 && controlChars / text.length > 0.01) {
    throw new DocumentError("unreadable", `This file looks like binary data, not text. Upload ${SUPPORTED_FORMATS_LABEL}.`);
  }
  return { text, warnings };
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
  return head.includes("%PDF-");
}

function hasZipHeader(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Converts decoded text for the structured formats; plain text and Markdown pass through. */
function convertText(kind: DocumentKind, text: string, fileName: string): { text: string; warnings: string[] } {
  if (kind === "html") return { text: htmlToText(text), warnings: [] };
  if (kind === "csv") {
    const { text: out, rows } = csvToText(text);
    return { text: out, warnings: rows === 0 ? ["The CSV has a header row but no data rows."] : [] };
  }
  if (kind === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      throw new DocumentError("unreadable", `"${fileName}" is not valid JSON${detail}.`);
    }
    const { text: out, truncated } = jsonToText(parsed);
    return { text: out, warnings: truncated ? ["The JSON is very large; only the first 20,000 values were kept."] : [] };
  }
  return { text, warnings: [] };
}

let defaultPdfExtractor: PdfExtractor | null = null;
let defaultDocxExtractor: DocxExtractor | null = null;

async function loadDefaultDocxExtractor(): Promise<DocxExtractor> {
  if (!defaultDocxExtractor) defaultDocxExtractor = (await import("./docx")).extractDocxText;
  return defaultDocxExtractor;
}

async function loadDefaultPdfExtractor(): Promise<PdfExtractor> {
  if (!defaultPdfExtractor) {
    const mod = await import("./pdf");
    defaultPdfExtractor = mod.extractPdfPages;
  }
  return defaultPdfExtractor;
}

export async function extractDocument(
  file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
  options: { pdfExtractor?: PdfExtractor; docxExtractor?: DocxExtractor } = {},
): Promise<ExtractedDocument> {
  const kind = detectKind(file.name, file.type);
  if (!kind) {
    throw new DocumentError("unsupported", `"${file.name}" is not supported. Upload ${SUPPORTED_FORMATS_LABEL}.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new DocumentError("too_large", `"${file.name}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  if (file.size === 0) throw new DocumentError("empty", `"${file.name}" is empty.`);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new DocumentError("unreadable", `"${file.name}" could not be read by the browser.`);
  }

  if (kind === "docx") {
    if (!hasZipHeader(bytes)) {
      throw new DocumentError("unreadable", `"${file.name}" is not a valid Word document. Older .doc files are not supported; save it as .docx.`);
    }
    const extractor = options.docxExtractor ?? (await loadDefaultDocxExtractor());
    let result: DocxExtraction;
    try {
      result = await extractor(bytes);
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      throw new DocumentError("unreadable", `"${file.name}" could not be read as a Word document${detail}.`);
    }
    return finish(file.name, kind, result.text, result.warnings);
  }

  if (kind !== "pdf") {
    const decoded = decodeText(bytes);
    const converted = convertText(kind, decoded.text, file.name);
    return finish(file.name, kind, converted.text, [...decoded.warnings, ...converted.warnings]);
  }

  if (!hasPdfHeader(bytes)) {
    throw new DocumentError("unreadable", `"${file.name}" does not start like a PDF file. It may be damaged or mislabelled.`);
  }

  const extractor = options.pdfExtractor ?? (await loadDefaultPdfExtractor());
  let pages: string[];
  try {
    ({ pages } = await extractor(bytes));
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new DocumentError("unreadable", `"${file.name}" is password protected. Remove the password and upload it again.`);
    }
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new DocumentError("unreadable", `"${file.name}" could not be parsed as a PDF${detail}.`);
  }

  const cleaned = pages.map(normalizeText);
  const emptyPages = cleaned.map((p, i) => (p ? -1 : i + 1)).filter((n) => n > 0);
  const text = cleaned.filter(Boolean).join("\n\n");
  if (!text) {
    throw new DocumentError(
      "no_text",
      `"${file.name}" has no extractable text. It is probably a scanned image; OCR is not supported, so export a text-based PDF instead.`,
    );
  }
  const warnings: string[] = [];
  if (emptyPages.length) {
    warnings.push(`No text found on page${emptyPages.length > 1 ? "s" : ""} ${emptyPages.join(", ")} (possibly scanned images).`);
  }
  return { kind, text, pageCount: pages.length, warnings };
}

function finish(fileName: string, kind: DocumentKind, raw: string, warnings: string[]): ExtractedDocument {
  const text = normalizeText(raw);
  if (!text) throw new DocumentError("empty", `"${fileName}" contains no readable text.`);
  if (text.length > MAX_TEXT_CHARS) {
    throw new DocumentError("too_large", `"${fileName}" contains more than ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters of text.`);
  }
  return { kind, text, warnings };
}

/** Turns pasted text into a document, with the same validation as uploaded files. */
export function documentFromText(name: string, text: string): ExtractedDocument & { name: string } {
  const title = name.trim() || "Pasted text";
  return { ...finish(title, "text", text, []), name: title };
}
