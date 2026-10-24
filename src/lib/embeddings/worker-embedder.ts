import { EMBEDDING_MODEL, type Embedder, type LoadProgress, type WorkerRequest, type WorkerResponse } from "./types";

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: LoadProgress) => void;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Runs the Transformers.js model in a Web Worker so model loading and inference never block the page. */
export class WorkerEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL.id;
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") throw new Error("This browser does not support Web Workers.");
    const worker = new Worker(new URL("./embed.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      if (message.type === "progress") {
        entry.onProgress?.(message.progress);
        return;
      }
      this.pending.delete(message.id);
      if (message.type === "error") entry.reject(new Error(message.message));
      else entry.resolve(message);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The embedding worker crashed.");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private request(body: DistributiveOmit<WorkerRequest, "id">, onProgress?: Pending["onProgress"]) {
    const id = this.nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.getWorker().postMessage({ ...body, id } as WorkerRequest);
    });
  }

  async load(onProgress?: (progress: LoadProgress) => void) {
    const response = await this.request({ type: "load", modelId: EMBEDDING_MODEL.id, dtype: EMBEDDING_MODEL.dtype }, onProgress);
    if (response.type !== "loaded") throw new Error("Unexpected response from the embedding worker.");
    return { device: response.device };
  }

  async embed(texts: string[]) {
    if (texts.length === 0) return [];
    const response = await this.request({ type: "embed", texts });
    if (response.type !== "embedded") throw new Error("Unexpected response from the embedding worker.");
    return response.vectors;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) entry.reject(new Error("The embedding model was unloaded."));
    this.pending.clear();
  }
}
