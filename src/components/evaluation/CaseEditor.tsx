"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { validateCase } from "@/lib/evaluation/run";
import type { EvalCase } from "@/lib/evaluation/types";
import type { WorkspaceDocument } from "@/lib/types";

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function CaseEditor({
  initial,
  documents,
  onSave,
  onCancel,
}: {
  initial: EvalCase;
  documents: WorkspaceDocument[];
  onSave: (evalCase: EvalCase) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(initial.question);
  const [docIds, setDocIds] = useState<string[]>(initial.expectedDocIds);
  const [phrases, setPhrases] = useState(initial.evidencePhrases.join("\n"));
  const [facts, setFacts] = useState(initial.expectedFacts.join("\n"));
  const [unanswerable, setUnanswerable] = useState(initial.expectUnanswerable);
  const [problems, setProblems] = useState<string[]>([]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: EvalCase = {
      ...initial,
      question: question.trim(),
      expectedDocIds: unanswerable ? [] : docIds,
      evidencePhrases: unanswerable ? [] : lines(phrases),
      expectedFacts: unanswerable ? [] : lines(facts),
      expectUnanswerable: unanswerable,
    };
    const found = validateCase(next, new Set(documents.map((d) => d.id)));
    setProblems(found);
    if (found.length === 0) onSave(next);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Test case editor">
      <Field label="Question" htmlFor="case-question">
        <Input id="case-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should the system be able to answer?" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unanswerable} onChange={(e) => setUnanswerable(e.target.checked)} className="accent-[var(--accent)]" />
        The documents do not answer this question (the system should decline)
      </label>

      {!unanswerable && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">Expected source documents</legend>
            {documents.length === 0 && <p className="text-xs text-muted">No documents in this workspace.</p>}
            <div className="grid gap-1 sm:grid-cols-2">
              {documents.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={docIds.includes(d.id)}
                    onChange={(e) => setDocIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id)))}
                  />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Evidence phrases (one per line)"
            htmlFor="case-phrases"
            hint="A retrieved chunk is relevant if it contains one of these phrases (case-insensitive). Keep them short so they do not cross chunk boundaries."
          >
            <Textarea id="case-phrases" rows={3} value={phrases} onChange={(e) => setPhrases(e.target.value)} />
          </Field>
          <Field label="Expected answer facts (optional, one per line)" htmlFor="case-facts" hint="The answer text must contain each fact for the case to pass.">
            <Textarea id="case-facts" rows={2} value={facts} onChange={(e) => setFacts(e.target.value)} />
          </Field>
        </>
      )}

      {problems.length > 0 && (
        <Alert tone="danger" title="This test case is not valid yet">
          <ul className="list-disc pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Save test case
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
