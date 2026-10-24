import type { Metadata } from "next";
import { ChunkingView } from "@/components/views/ChunkingView";

export const metadata: Metadata = { title: "Chunking" };

export default function Page() {
  return <ChunkingView />;
}
