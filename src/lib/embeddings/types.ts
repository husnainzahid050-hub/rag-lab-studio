export const EMBEDDING_MODEL = {
  id: "Xenova/all-MiniLM-L6-v2",
  label: "all-MiniLM-L6-v2 (8-bit quantized)",
  dimensions: 384,
  dtype: "q8",
  /** model_quantized.onnx is 22,972,370 bytes on the Hugging Face Hub. */
  approxDownloadMb: 23,
  /** ONNX Runtime WebAssembly binary bundled with and served by this app. */
  runtimeWasmMb: 27,
  /** The tokenizer truncates input here (model_max_length); text beyond it is not embedded. */
  maxTokens: 512,
  /** sentence-transformers trained the model on inputs of up to this many word pieces. */
  trainedTokens: 256,
} as const;

export type EmbeddingStatus =
  | { state: "off" }
  | { state: "loading"; progress: number | null; loadedBytes: number; totalBytes: number; file?: string }
  | { state: "ready"; device: string }
  | { state: "error"; message: string };

export interface LoadProgress {
  progress: number | null;
  loadedBytes: number;
  totalBytes: number;
  file?: string;
}

export interface Embedder {
  readonly modelId: string;
  load(onProgress?: (progress: LoadProgress) => void): Promise<{ device: string }>;
  embed(texts: string[]): Promise<Float32Array[]>;
  dispose(): void;
}

export type WorkerRequest =
  | { id: number; type: "load"; modelId: string; dtype: string }
  | { id: number; type: "embed"; texts: string[] };

export type WorkerResponse =
  | { id: number; type: "progress"; progress: LoadProgress }
  | { id: number; type: "loaded"; device: string }
  | { id: number; type: "embedded"; vectors: Float32Array[] }
  | { id: number; type: "error"; message: string };
