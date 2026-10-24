"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ClipboardCheck,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  MessageSquareQuote,
  Scissors,
  Search,
  Settings,
  X,
} from "lucide-react";
import { EngineProvider } from "@/components/engine/EngineProvider";
import { Alert, Button, cn } from "@/components/ui/primitives";
import { useAppStore } from "@/lib/store";
import { RetrievalModeBadge } from "./RetrievalModeBadge";
import { WorkspaceSelector } from "./WorkspaceSelector";

export const NAV_ITEMS = [
  { href: "/", label: "Pipeline", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/chunking", label: "Chunking", icon: Scissors },
  { href: "/retrieval", label: "Retrieval", icon: Search },
  { href: "/ask", label: "Ask", icon: MessageSquareQuote },
  { href: "/evaluation", label: "Evaluation", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-fg">
        <FlaskConical className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">RAG Lab Studio</span>
        <span className="block text-[11px] text-muted">Retrieval, step by step</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function StorageBanner() {
  const storage = useAppStore((s) => s.storage);
  if (storage.state !== "unavailable" && storage.state !== "error") return null;
  return (
    <Alert tone="warning" title="Local storage problem" className="mb-4">
      {storage.message}
    </Alert>
  );
}

function HydrationGate({ children }: { children: ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted" role="status">
        Loading workspace from browser storage…
      </div>
    );
  }
  return children;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <EngineProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-4 lg:flex">
          <Brand />
          <NavList />
          <p className="mt-auto px-2 text-[11px] leading-relaxed text-muted">
            Everything runs in this browser. Documents never leave your device.
          </p>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} aria-hidden />
            <aside className="relative flex h-full w-64 flex-col gap-6 border-r border-border bg-surface px-3 py-4" aria-label="Navigation menu">
              <div className="flex items-center justify-between">
                <Brand />
                <Button variant="ghost" size="sm" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <X className="size-4" />
                </Button>
              </div>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
            <WorkspaceSelector />
            <div className="ml-auto">
              <RetrievalModeBadge />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
            <StorageBanner />
            <HydrationGate>{children}</HydrationGate>
          </main>
        </div>
      </div>
    </EngineProvider>
  );
}
