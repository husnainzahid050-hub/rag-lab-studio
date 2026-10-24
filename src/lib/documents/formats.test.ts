// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocxText } from "./docx";
import { DocumentError, MAX_TEXT_CHARS, detectKind, documentFromText, extractDocument } from "./extract";
import { csvToText, decodeEntities, htmlToText, jsonToText, parseCsv } from "./formats";

function fileFrom(name: string, content: string | Uint8Array, type = "") {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return new File([bytes as BlobPart], name, { type });
}

/** Builds a minimal, valid .docx with one paragraph per string. */
async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("detectKind for new formats", () => {
  it("recognises docx, html, csv and json", () => {
    expect(detectKind("report.DOCX", "")).toBe("docx");
    expect(detectKind("page.htm", "")).toBe("html");
    expect(detectKind("data.csv", "")).toBe("csv");
    expect(detectKind("export.json", "")).toBe("json");
    expect(detectKind("legacy.doc", "")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("keeps visible text, drops scripts, styles and comments, and decodes entities", () => {
    const html = `<html><head><title>T</title><style>p{}</style></head><body>
      <h1>Refund policy</h1><!-- hidden --><script>alert("x")</script>
      <p>Refunds take 5&nbsp;to&nbsp;7 days &amp; are free.</p><ul><li>One</li><li>Two</li></ul></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Refund policy");
    expect(text).toContain("Refunds take 5 to 7 days & are free.");
    expect(text).not.toMatch(/alert|hidden|p\{\}|<|>/);
    expect(text).toMatch(/One\s*\n+\s*Two/);
  });

  it("decodes numeric entities", () => {
    expect(decodeEntities("&#8364;5 &#x41;")).toBe("€5 A");
  });
});

describe("CSV", () => {
  it("parses quoted fields, escaped quotes and embedded newlines", () => {
    expect(parseCsv('name,note\n"Ali","said ""hi""\nthen left"\nSara,ok\n')).toEqual([
      ["name", "note"],
      ["Ali", 'said "hi"\nthen left'],
      ["Sara", "ok"],
    ]);
  });

  it("turns each row into a labelled paragraph", () => {
    const { text, rows } = csvToText("product,price\nEspresso,3.50\nLatte,\n");
    expect(rows).toBe(2);
    expect(text).toBe("Row 1. product: Espresso; price: 3.50.\n\nRow 2. product: Latte.");
  });
});

describe("jsonToText", () => {
  it("flattens nested values to path: value lines", () => {
    const { text } = jsonToText({ store: { name: "Harbor", tags: ["coffee", "tea"] }, open: true });
    expect(text.split("\n\n")).toEqual(["store.name: Harbor", "store.tags[0]: coffee", "store.tags[1]: tea", "open: true"]);
  });

  it("stops at the line limit and reports truncation", () => {
    const { text, truncated } = jsonToText(Array.from({ length: 10 }, (_, i) => i), 3);
    expect(truncated).toBe(true);
    expect(text.split("\n\n")).toHaveLength(3);
  });
});

describe("extractDocument with new formats", () => {
  it("extracts HTML, CSV and JSON files", async () => {
    expect((await extractDocument(fileFrom("a.html", "<p>Hello <b>world</b></p>"))).text).toBe("Hello world");
    expect((await extractDocument(fileFrom("a.csv", "a,b\n1,2"))).text).toBe("Row 1. a: 1; b: 2.");
    expect((await extractDocument(fileFrom("a.json", '{"k":"v"}'))).text).toBe("k: v");
  });

  it("rejects invalid JSON and empty HTML", async () => {
    const bad = await extractDocument(fileFrom("bad.json", "{oops")).catch((e) => e);
    expect(bad).toBeInstanceOf(DocumentError);
    expect(bad.message).toMatch(/not valid JSON/);
    const empty = await extractDocument(fileFrom("empty.html", "<script>x()</script>")).catch((e) => e);
    expect(empty.code).toBe("empty");
  });

  it("reads a real .docx file with mammoth", async () => {
    const bytes = await makeDocx(["Quarterly report", "Revenue grew by 12 percent."]);
    expect((await extractDocxText(bytes)).text).toContain("Revenue grew by 12 percent.");
    const result = await extractDocument(fileFrom("report.docx", bytes));
    expect(result.kind).toBe("docx");
    expect(result.text).toBe("Quarterly report\n\nRevenue grew by 12 percent.");
  });

  it("rejects a .docx that is not a zip archive", async () => {
    const error = await extractDocument(fileFrom("old.docx", "not a zip")).catch((e) => e);
    expect(error.code).toBe("unreadable");
    expect(error.message).toMatch(/\.docx/);
  });
});

describe("documentFromText", () => {
  it("creates a text document with a default title", () => {
    expect(documentFromText("  ", "  Some notes \r\n")).toMatchObject({ name: "Pasted text", text: "Some notes", kind: "text" });
  });

  it("rejects empty and oversized text", () => {
    expect(() => documentFromText("x", "   ")).toThrow(/no readable text/);
    expect(() => documentFromText("x", "a".repeat(MAX_TEXT_CHARS + 1))).toThrow(/more than/);
  });
});
