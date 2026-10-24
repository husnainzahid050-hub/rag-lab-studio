import { pipeline, type FeatureExtractionPipeline, type ProgressInfo } from "@huggingface/transformers";
import type { WorkerRequest, WorkerResponse } from "./types";

interface WorkerScope {
  postMessage(message: WorkerResponse, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

// The project compiles with the DOM lib, so describe the worker global explicitly.
const scope = self as unknown as WorkerScope;

let extractor: FeatureExtractionPipeline | null = null;

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

async function load(id: number, modelId: string, dtype: string) {
  if (extractor) {
    post({ id, type: "loaded", device: "wasm" });
    return;
  }
  extractor = (await pipeline("feature-extraction", modelId, {
    dtype: dtype as "q8",
    device: "wasm",
    progress_callback: (info: ProgressInfo) => {
      if (info.status === "progress_total") {
        post({ id, type: "progress", progress: { progress: info.progress, loadedBytes: info.loaded, totalBytes: info.total } });
      } else if (info.status === "progress") {
        post({
          id,
          type: "progress",
          progress: { progress: null, loadedBytes: info.loaded, totalBytes: info.total, file: info.file },
        });
      }
    },
  })) as FeatureExtractionPipeline;
  post({ id, type: "loaded", device: "wasm" });
}

async function embed(id: number, texts: string[]) {
  if (!extractor) throw new Error("The embedding model is not loaded.");
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const [rows, dims] = output.dims as [number, number];
  const data = output.data as Float32Array;
  const vectors: Float32Array[] = [];
  for (let r = 0; r < rows; r++) vectors.push(data.slice(r * dims, (r + 1) * dims));
  post({ id, type: "embedded", vectors }, vectors.map((v) => v.buffer as ArrayBuffer));
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") await load(request.id, request.modelId, request.dtype);
    else await embed(request.id, request.texts);
  } catch (error) {
    post({ id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
