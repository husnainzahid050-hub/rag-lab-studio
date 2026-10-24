import type { Metadata } from "next";
import { RetrievalView } from "@/components/views/RetrievalView";

export const metadata: Metadata = { title: "Retrieval" };

export default function Page() {
  return <RetrievalView />;
}
