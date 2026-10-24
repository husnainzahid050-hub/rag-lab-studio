export type DocumentKind = "text" | "markdown" | "pdf";
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

export type RetrievalMode = "lexical" | "semantic";

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
