import type { DocumentKind } from "../types";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".pdf"] as const;
export const ACCEPT_ATTRIBUTE = ".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf";

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

export function detectKind(fileName: string, mimeType: string): DocumentKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (name.endsWith(".md") || name.endsWith(".markdown") || mimeType === "text/markdown") return "markdown";
  if (name.endsWith(".txt") || mimeType === "text/plain") return "text";
  return null;
}

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
    throw new DocumentError("unreadable", "This file looks like binary data, not text. Upload a .txt, .md or .pdf file.");
  }
  return { text, warnings };
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
  return head.includes("%PDF-");
}

let defaultPdfExtractor: PdfExtractor | null = null;

async function loadDefaultPdfExtractor(): Promise<PdfExtractor> {
  if (!defaultPdfExtractor) {
    const mod = await import("./pdf");
    defaultPdfExtractor = mod.extractPdfPages;
  }
  return defaultPdfExtractor;
}

export async function extractDocument(
  file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
  options: { pdfExtractor?: PdfExtractor } = {},
): Promise<ExtractedDocument> {
  const kind = detectKind(file.name, file.type);
  if (!kind) {
    throw new DocumentError("unsupported", `"${file.name}" is not supported. Upload plain text (.txt), Markdown (.md) or PDF (.pdf).`);
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

  if (kind !== "pdf") {
    const { text, warnings } = decodeText(bytes);
    const normalized = normalizeText(text);
    if (!normalized) throw new DocumentError("empty", `"${file.name}" contains only whitespace.`);
    return { kind, text: normalized, warnings };
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
