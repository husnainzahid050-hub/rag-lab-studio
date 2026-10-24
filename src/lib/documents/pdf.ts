import type { PdfExtraction } from "./extract";

type PdfJs = typeof import("pdfjs-dist");

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
          type: "module",
        });
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Joins pdf.js text items into lines, using the end-of-line flags pdf.js reports. */
export function joinTextItems(items: TextItemLike[]): string {
  let out = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
  }
  return out;
}

export async function extractPdfPages(data: Uint8Array, pdfjs?: Pick<PdfJs, "getDocument">): Promise<PdfExtraction> {
  const lib = pdfjs ?? (await loadPdfJs());
  // pdf.js transfers the buffer to its worker, so give it a copy.
  const task = lib.getDocument({ data: data.slice() });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items as TextItemLike[]));
      page.cleanup();
    }
    return { pages };
  } finally {
    await task.destroy();
  }
}
