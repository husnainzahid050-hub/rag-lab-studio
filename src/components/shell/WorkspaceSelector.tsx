"use client";

import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { WORKSPACES, useAppStore } from "@/lib/store";

export function WorkspaceSelector() {
  const activeId = useAppStore((s) => s.activeWorkspaceId);
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const active = WORKSPACES.find((w) => w.id === activeId);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <FolderOpen className="size-4 shrink-0 text-muted" aria-hidden />
      <label htmlFor="workspace-select" className="sr-only">
        Workspace
      </label>
      <select
        id="workspace-select"
        value={activeId}
        onChange={(e) => setActive(e.target.value)}
        className="h-8 max-w-[10rem] min-w-0 rounded-md border border-border sm:max-w-none bg-surface px-2 text-sm font-medium focus:border-accent focus:outline-none"
      >
        {WORKSPACES.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {active?.origin === "sample" && (
        <span className="hidden sm:inline-flex">
          <Badge tone="info">Sample content</Badge>
        </span>
      )}
    </div>
  );
}
