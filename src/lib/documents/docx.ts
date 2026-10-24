export interface DocxExtraction {
  text: string;
  warnings: string[];
}

/** Raw text of a .docx file via mammoth, which is loaded only when a Word file is uploaded. */
export async function extractDocxText(data: Uint8Array): Promise<DocxExtraction> {
  const mammoth = (await import("mammoth")).default;
  const copy = data.slice();
  // The browser build reads an ArrayBuffer; the Node build (used in tests) reads a Buffer.
  const input =
    typeof window === "undefined" ? { buffer: Buffer.from(copy) } : { arrayBuffer: copy.buffer as ArrayBuffer };
  const result = await mammoth.extractRawText(input as { arrayBuffer: ArrayBuffer });
  return {
    text: result.value,
    warnings: result.messages.filter((m) => m.type === "warning").map((m) => m.message),
  };
}
