"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronsUpDown, FolderOpen, Plus, Settings2 } from "lucide-react";
import { Badge, Button, Input, cn } from "@/components/ui/primitives";
import { useActiveWorkspace, useAppStore } from "@/lib/store";

/** Dropdown for switching and creating workspaces. */
export function WorkspaceSelector({ className }: { className?: string }) {
  const workspaces = useAppStore((s) => s.workspaces);
  const documents = useAppStore((s) => s.documents);
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const active = useActiveWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const countFor = (id: string) => documents.filter((d) => d.workspaceId === id).length;

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createWorkspace(name);
    setName("");
    setCreating(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Workspace: ${active?.name ?? "none"}`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left shadow-card transition-colors hover:border-border-strong"
      >
        <span className="bg-brand flex size-7 shrink-0 items-center justify-center rounded-md text-white">
          <FolderOpen className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{active?.name ?? "No workspace"}</span>
          <span className="block text-[11px] text-muted">
            {active ? `${countFor(active.id)} document(s)` : ""}
            {active?.origin === "sample" ? " · sample content" : ""}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>

      {open && (
        <div className="animate-fade-up absolute top-full left-0 z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-1.5 shadow-lift">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Workspaces</p>
          <ul role="listbox" aria-label="Workspaces" className="scrollbar-thin max-h-64 overflow-y-auto">
            {workspaces.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={w.id === active?.id}
                  onClick={() => {
                    setActive(w.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <Check className={cn("size-4 shrink-0 text-accent", w.id !== active?.id && "invisible")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  {w.origin === "sample" && <Badge tone="info">Sample</Badge>}
                  <span className="font-mono text-[11px] text-muted">{countFor(w.id)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-border pt-1.5">
            {creating ? (
              <form onSubmit={onCreate} className="flex gap-1.5 p-1">
                <label htmlFor="new-workspace-name" className="sr-only">
                  New workspace name
                </label>
                <Input
                  id="new-workspace-name"
                  autoFocus
                  placeholder="e.g. Research papers"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 min-w-0 flex-1 text-xs"
                />
                <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>
                  Create
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                <Plus className="size-4" aria-hidden /> New workspace
              </button>
            )}
            <Link
              href="/settings#workspaces"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Settings2 className="size-4" aria-hidden /> Manage, export or import
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
