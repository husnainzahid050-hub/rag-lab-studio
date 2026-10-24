// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makePdf } from "@/test/make-pdf";
import { DocumentError, MAX_FILE_BYTES, detectKind, extractDocument, normalizeText, type PdfExtractor } from "./extract";
import { extractPdfPages, joinTextItems } from "./pdf";

function fileFrom(name: string, content: string | Uint8Array, type = "") {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return new File([bytes as BlobPart], name, { type });
}

async function realPdfExtractor(): Promise<PdfExtractor> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (data) => extractPdfPages(data, pdfjs);
}

async function expectDocumentError(promise: Promise<unknown>, code: DocumentError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentError);
  expect((error as DocumentError).code).toBe(code);
}

describe("detectKind", () => {
  it("recognises supported extensions and MIME types", () => {
    expect(detectKind("notes.TXT", "")).toBe("text");
    expect(detectKind("readme.md", "")).toBe("markdown");
    expect(detectKind("paper.pdf", "")).toBe("pdf");
    expect(detectKind("blob", "application/pdf")).toBe("pdf");
    expect(detectKind("image.png", "image/png")).toBeNull();
  });
});

describe("normalizeText", () => {
  it("strips the BOM, normalises line endings and collapses blank lines", () => {
    expect(normalizeText("﻿a\r\nb  \r\n\r\n\r\n\r\nc")).toBe("a\nb\n\nc");
  });
});

describe("extractDocument", () => {
  it("extracts plain text and Markdown", async () => {
    const txt = await extractDocument(fileFrom("a.txt", "Hello\r\nworld"));
    expect(txt).toMatchObject({ kind: "text", text: "Hello\nworld", warnings: [] });
    const md = await extractDocument(fileFrom("a.md", "# Title\n\nBody"));
    expect(md.kind).toBe("markdown");
    expect(md.text).toBe("# Title\n\nBody");
  });

  it("rejects unsupported, empty, whitespace-only and oversized files", async () => {
    await expectDocumentError(extractDocument(fileFrom("photo.png", "x", "image/png")), "unsupported");
    await expectDocumentError(extractDocument(fileFrom("empty.txt", "")), "empty");
    await expectDocumentError(extractDocument(fileFrom("blank.txt", " \n\n\t")), "empty");
    const huge = { name: "big.txt", type: "text/plain", size: MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) };
    await expectDocumentError(extractDocument(huge), "too_large");
  });

  it("rejects binary data disguised as text", async () => {
    const binary = new Uint8Array(200).map((_, i) => i % 9);
    await expectDocumentError(extractDocument(fileFrom("data.txt", binary)), "unreadable");
  });

  it("warns about invalid UTF-8 instead of failing silently", async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("Caf"), 0xe9, ...new TextEncoder().encode(" menu")]);
    const result = await extractDocument(fileFrom("latin1.txt", bytes));
    expect(result.warnings[0]).toMatch(/not valid UTF-8/);
  });

  it("rejects a .pdf that is not a PDF", async () => {
    await expectDocumentError(extractDocument(fileFrom("fake.pdf", "just text")), "unreadable");
  });

  it("extracts text from a real PDF with pdf.js and counts pages", async () => {
    const pdf = makePdf(["Refunds take 5 to 7 business days.", "Second page text."]);
    const result = await extractDocument(fileFrom("policy.pdf", pdf), { pdfExtractor: await realPdfExtractor() });
    expect(result.kind).toBe("pdf");
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("Refunds take 5 to 7 business days.");
    expect(result.text).toContain("Second page text.");
    expect(result.warnings).toEqual([]);
  });

  it("warns about pages without text and fails when no page has text", async () => {
    const extractor = await realPdfExtractor();
    const partial = await extractDocument(fileFrom("mixed.pdf", makePdf(["Some text.", ""])), { pdfExtractor: extractor });
    expect(partial.warnings[0]).toMatch(/page 2/);
    await expectDocumentError(extractDocument(fileFrom("scan.pdf", makePdf(["", ""])), { pdfExtractor: extractor }), "no_text");
  });

  it("reports a malformed PDF as unreadable", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4\n garbage without objects");
    await expectDocumentError(extractDocument(fileFrom("broken.pdf", broken), { pdfExtractor: await realPdfExtractor() }), "unreadable");
  });

  it("reports password-protected PDFs clearly", async () => {
    const extractor: PdfExtractor = async () => {
      const error = new Error("No password given");
      error.name = "PasswordException";
      throw error;
    };
    const error = await extractDocument(fileFrom("locked.pdf", makePdf(["x"])), { pdfExtractor: extractor }).catch((e) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect(error.message).toMatch(/password/);
  });
});

describe("joinTextItems", () => {
  it("joins items and breaks lines at end-of-line markers", () => {
    expect(joinTextItems([{ str: "Hello" }, { str: " world", hasEOL: true }, { str: "Next" }, {}])).toBe("Hello world\nNext");
  });
});
