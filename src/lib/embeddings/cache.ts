import type { Embedder } from "./types";

/** FNV-1a 64-bit hash of a string, as hex. Used only as a cache key, not for security. */
export function hashText(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0") + text.length.toString(16);
}

export interface VectorStore {
  getMany(keys: string[]): Promise<(Float32Array | undefined)[]>;
  setMany(entries: [string, Float32Array][]): Promise<void>;
}

export const EMBED_BATCH_SIZE = 16;

/**
 * Embeds texts, reusing vectors from memory and the persistent store when the same
 * text was embedded before by the same model. Calls `onProgress(done, total)` after each batch.
 */
export class EmbeddingCache {
  private memory = new Map<string, Float32Array>();

  constructor(private readonly store: VectorStore | null) {}

  key(modelId: string, text: string) {
    return `${modelId}:${hashText(text)}`;
  }

  async embed(
    embedder: Embedder,
    texts: string[],
    onProgress?: (done: number, total: number) => void,
    signal?: { cancelled: boolean },
  ): Promise<Float32Array[]> {
    const keys = texts.map((t) => this.key(embedder.modelId, t));
    const missing = keys.map((k, i) => (this.memory.has(k) ? -1 : i)).filter((i) => i >= 0);

    if (missing.length && this.store) {
      try {
        const stored = await this.store.getMany(missing.map((i) => keys[i]));
        stored.forEach((vector, j) => {
          if (vector) this.memory.set(keys[missing[j]], vector);
        });
      } catch {
        // A failing persistent cache only costs recomputation.
      }
    }

    const todo = [...new Set(keys.map((k, i) => (this.memory.has(k) ? -1 : i)).filter((i) => i >= 0))];
    const total = texts.length;
    let done = total - todo.length;
    onProgress?.(done, total);

    for (let b = 0; b < todo.length; b += EMBED_BATCH_SIZE) {
      if (signal?.cancelled) throw new Error("Embedding was cancelled.");
      const batch = todo.slice(b, b + EMBED_BATCH_SIZE);
      const vectors = await embedder.embed(batch.map((i) => texts[i]));
      const entries: [string, Float32Array][] = batch.map((i, j) => [keys[i], vectors[j]]);
      for (const [k, v] of entries) this.memory.set(k, v);
      if (this.store) await this.store.setMany(entries).catch(() => undefined);
      done += batch.length;
      onProgress?.(done, total);
    }

    return keys.map((k) => this.memory.get(k)!);
  }

  clearMemory() {
    this.memory.clear();
  }
}
