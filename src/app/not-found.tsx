import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted">This page does not exist in RAG Lab Studio.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
        Back to the pipeline
      </Link>
    </div>
  );
}
