import type { EvalCase } from "./evaluation/types";
import type { ContentOrigin, DocumentKind, WorkspaceDocument } from "./types";

export const BUNDLE_FORMAT = "rag-lab-studio/workspace";
export const BUNDLE_VERSION = 1;

type BundleDocument = Omit<WorkspaceDocument, "workspaceId">;
type BundleCase = Omit<EvalCase, "workspaceId">;

/** A portable backup of one workspace: its documents (with extracted text) and test cases. */
export interface WorkspaceBundle {
  format: typeof BUNDLE_FORMAT;
  version: typeof BUNDLE_VERSION;
  exportedAt: string;
  workspace: { name: string };
  documents: BundleDocument[];
  evalCases: BundleCase[];
}

const KINDS: DocumentKind[] = ["text", "markdown", "pdf", "docx", "html", "csv", "json"];
const ORIGINS: ContentOrigin[] = ["sample", "user"];

function withoutWorkspace<T extends { workspaceId: string }>(item: T): Omit<T, "workspaceId"> {
  const copy: Partial<T> = { ...item };
  delete copy.workspaceId;
  return copy as Omit<T, "workspaceId">;
}

export function exportWorkspace(name: string, documents: WorkspaceDocument[], evalCases: EvalCase[], now = new Date()): WorkspaceBundle {
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: now.toISOString(),
    workspace: { name },
    documents: documents.map(withoutWorkspace),
    evalCases: evalCases.map(withoutWorkspace),
  };
}

export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleError";
  }
}

const isString = (v: unknown): v is string => typeof v === "string";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/** Validates untrusted JSON from a backup file. Throws BundleError with a readable message. */
export function parseWorkspaceBundle(data: unknown): WorkspaceBundle {
  if (!data || typeof data !== "object") throw new BundleError("The file does not contain a workspace backup.");
  const b = data as Record<string, unknown>;
  if (b.format !== BUNDLE_FORMAT) throw new BundleError("This is not a RAG Lab Studio workspace backup.");
  if (b.version !== BUNDLE_VERSION) throw new BundleError(`Unsupported backup version ${String(b.version)}.`);
  const ws = b.workspace as Record<string, unknown> | undefined;
  if (!ws || !isString(ws.name)) throw new BundleError("The backup is missing the workspace name.");
  if (!Array.isArray(b.documents) || !Array.isArray(b.evalCases)) throw new BundleError("The backup is missing documents or test cases.");

  const documents = b.documents.map((raw, i): BundleDocument => {
    const d = raw as Record<string, unknown>;
    if (!isString(d.id) || !isString(d.name) || !isString(d.text) || !KINDS.includes(d.kind as DocumentKind)) {
      throw new BundleError(`Document ${i + 1} in the backup is malformed.`);
    }
    return {
      id: d.id,
      name: d.name,
      kind: d.kind as DocumentKind,
      origin: ORIGINS.includes(d.origin as ContentOrigin) ? (d.origin as ContentOrigin) : "user",
      sizeBytes: typeof d.sizeBytes === "number" ? d.sizeBytes : d.text.length,
      text: d.text,
      charCount: d.text.length,
      pageCount: typeof d.pageCount === "number" ? d.pageCount : undefined,
      warnings: isStringArray(d.warnings) ? d.warnings : [],
      extractionMs: typeof d.extractionMs === "number" ? d.extractionMs : 0,
      addedAt: isString(d.addedAt) ? d.addedAt : new Date().toISOString(),
    };
  });

  const evalCases = b.evalCases.map((raw, i): BundleCase => {
    const c = raw as Record<string, unknown>;
    if (!isString(c.id) || !isString(c.question)) throw new BundleError(`Test case ${i + 1} in the backup is malformed.`);
    return {
      id: c.id,
      origin: ORIGINS.includes(c.origin as ContentOrigin) ? (c.origin as ContentOrigin) : "user",
      question: c.question,
      expectedDocIds: isStringArray(c.expectedDocIds) ? c.expectedDocIds : [],
      evidencePhrases: isStringArray(c.evidencePhrases) ? c.evidencePhrases : [],
      expectedFacts: isStringArray(c.expectedFacts) ? c.expectedFacts : [],
      expectUnanswerable: c.expectUnanswerable === true,
      createdAt: isString(c.createdAt) ? c.createdAt : new Date().toISOString(),
    };
  });

  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: isString(b.exportedAt) ? b.exportedAt : "", workspace: { name: ws.name }, documents, evalCases };
}

/**
 * Places a bundle into a workspace with fresh IDs, so importing the same backup twice
 * never collides. Test-case document references are remapped to the new IDs.
 */
export function materializeBundle(
  bundle: WorkspaceBundle,
  workspaceId: string,
  createId: (prefix: string) => string,
): { documents: WorkspaceDocument[]; evalCases: EvalCase[] } {
  const idMap = new Map<string, string>();
  const documents = bundle.documents.map((d) => {
    const id = createId("doc");
    idMap.set(d.id, id);
    return { ...d, id, workspaceId };
  });
  const evalCases = bundle.evalCases.map((c) => ({
    ...c,
    id: createId("case"),
    workspaceId,
    expectedDocIds: c.expectedDocIds.map((id) => idMap.get(id) ?? id),
  }));
  return { documents, evalCases };
}
