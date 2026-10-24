export type DocumentKind = "text" | "markdown" | "pdf" | "docx" | "html" | "csv" | "json";
export type ContentOrigin = "sample" | "user";

export interface WorkspaceDocument {
  id: string;
  workspaceId: string;
  name: string;
  kind: DocumentKind;
  origin: ContentOrigin;
  sizeBytes: number;
  text: string;
  charCount: number;
  pageCount?: number;
  warnings: string[];
  extractionMs: number;
  addedAt: string;
}

export type ChunkStrategy = "fixed" | "sentence";

export interface ChunkSettings {
  strategy: ChunkStrategy;
  size: number;
  overlap: number;
}

export interface Chunk {
  id: string;
  docId: string;
  docName: string;
  index: number;
  /** Inclusive start offset in the source document text. */
  start: number;
  /** Exclusive end offset in the source document text. */
  end: number;
  text: string;
}

export type RetrievalMode = "lexical" | "semantic" | "hybrid";

/** Semantic and hybrid retrieval both need chunk embeddings. */
export function usesEmbeddings(mode: RetrievalMode): boolean {
  return mode !== "lexical";
}

export const RETRIEVAL_MODE_LABELS: Record<RetrievalMode, string> = {
  lexical: "Lexical (BM25)",
  semantic: "Semantic (embeddings)",
  hybrid: "Hybrid (BM25 + embeddings)",
};

export type AnswerStrictness = "strict" | "balanced" | "lenient";

export interface AnswerSettings {
  strictness: AnswerStrictness;
}

export interface RetrievalSettings {
  mode: RetrievalMode;
  topK: number;
  /** Results with a cosine similarity below this are dropped in semantic mode. */
  semanticMinScore: number;
}

export interface Workspace {
  id: string;
  name: string;
  origin: ContentOrigin;
}
