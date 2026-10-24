export const STAGES = [
  { id: "ingestion", label: "Document ingestion", description: "Files are validated (type, size) and read in the browser." },
  { id: "extraction", label: "Text extraction", description: "Plain text, Markdown and PDF text layers are converted to clean text." },
  { id: "chunking", label: "Chunking", description: "Text is split into overlapping chunks with recorded character offsets." },
  { id: "indexing", label: "Indexing", description: "A BM25 index is always built; chunk embeddings are added when the model is loaded." },
  { id: "retrieval", label: "Retrieval", description: "The query is scored against every chunk and the top-k are returned." },
  { id: "answering", label: "Answer assembly", description: "Sentences that cover the question are extracted from the retrieved chunks." },
  { id: "citations", label: "Citations", description: "Every answer sentence is linked to the chunk it was copied from." },
  { id: "evaluation", label: "Evaluation", description: "Test cases are run and retrieval metrics are computed." },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export type StageStatus = "idle" | "running" | "done" | "warning" | "error";

export interface StageState {
  status: StageStatus;
  detail?: string;
  durationMs?: number;
  updatedAt?: string;
}

export function idlePipeline(): Record<StageId, StageState> {
  return Object.fromEntries(STAGES.map((s) => [s.id, { status: "idle" }])) as Record<StageId, StageState>;
}
