import type { Metadata } from "next";
import { EvaluationView } from "@/components/views/EvaluationView";

export const metadata: Metadata = { title: "Evaluation" };

export default function Page() {
  return <EvaluationView />;
}
