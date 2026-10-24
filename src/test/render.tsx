import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { EngineProvider } from "@/components/engine/EngineProvider";
import type { Embedder } from "@/lib/embeddings/types";
import { useAppStore } from "@/lib/store";
import { tokenize } from "@/lib/text/tokenize";

const DIMENSIONS = 64;

/** Deterministic stand-in for the real model: a hashed bag-of-words vector. */
export function createFakeEmbedder(options: { failLoad?: boolean } = {}): Embedder {
  return {
    modelId: "fake/bag-of-words",
    async load(onProgress) {
      onProgress?.({ progress: 50, loadedBytes: 5, totalBytes: 10 });
      if (options.failLoad) throw new Error("network unavailable");
      return { device: "test" };
    },
    async embed(texts) {
      return texts.map((text) => {
        const v = new Float32Array(DIMENSIONS);
        for (const term of tokenize(text)) {
          let h = 0;
          for (const ch of term) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
          v[h % DIMENSIONS] += 1;
        }
        return v;
      });
    },
    dispose() {},
  };
}

export function renderWithEngine(ui: ReactElement, embedder: () => Embedder = () => createFakeEmbedder()) {
  const user = userEvent.setup();
  const result = render(
    <EngineProvider persist={false} createEmbedder={embedder}>
      {ui}
    </EngineProvider>,
  );
  return { user, ...result };
}

/** Waits until the store has hydrated from IndexedDB and the page has rendered its heading. */
export async function waitForPage(heading: string | RegExp) {
  await waitFor(() => expect(useAppStore.getState().hydrated).toBe(true));
  await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument());
}
