"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ClipboardCheck,
  Code2,
  FileText,
  LayoutDashboard,
  Lock,
  Menu,
  MessageSquareQuote,
  Scissors,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { EngineProvider } from "@/components/engine/EngineProvider";
import { Alert, Button, cn } from "@/components/ui/primitives";
import { useAppStore } from "@/lib/store";
import { RetrievalModeBadge } from "./RetrievalModeBadge";
import { WorkspaceSelector } from "./WorkspaceSelector";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ href: "/", label: "Pipeline", icon: LayoutDashboard }] },
  {
    label: "Build",
    items: [
      { href: "/documents", label: "Documents", icon: FileText },
      { href: "/chunking", label: "Chunking", icon: Scissors },
    ],
  },
  {
    label: "Query",
    items: [
      { href: "/ask", label: "Ask", icon: MessageSquareQuote },
      { href: "/retrieval", label: "Retrieval", icon: Search },
    ],
  },
  { label: "Measure", items: [{ href: "/evaluation", label: "Evaluation", icon: ClipboardCheck }] },
  { label: "System", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const SOURCE_URL = "https://github.com/husnainzahid050-hub/rag-lab-studio";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="bg-brand shadow-glow flex size-9 items-center justify-center rounded-xl text-white">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">RAG Lab Studio</span>
        <span className="block text-[11px] text-muted">Retrieval, step by step</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-wider text-muted/80 uppercase">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-accent" : "text-muted group-hover:text-fg")} aria-hidden />
                  {label}
                  {active && <span className="bg-brand ml-auto h-1.5 w-1.5 rounded-full" aria-hidden />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-auto space-y-2">
      <div className="rounded-xl border border-border bg-surface-2/60 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Lock className="size-3.5 text-success" aria-hidden /> Private by design
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Everything runs in this browser. Your documents never leave your device.</p>
      </div>
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Code2 className="size-3.5" aria-hidden /> Source code on GitHub
      </a>
    </div>
  );
}

function StorageBanner() {
  const storage = useAppStore((s) => s.storage);
  if (storage.state !== "unavailable" && storage.state !== "error") return null;
  return (
    <Alert tone="warning" title="Local storage problem" className="mb-5">
      {storage.message}
    </Alert>
  );
}

function HydrationGate({ children }: { children: ReactNode }) {
  const hydrated = useAppStore((s) => s.hydrated);
  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted" role="status">
        <span className="bg-brand size-8 animate-pulse rounded-xl" aria-hidden />
        Loading your workspace…
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
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-surface/70 px-3 py-4 backdrop-blur lg:flex">
          <Brand />
          <WorkspaceSelector />
          <NavList />
          <SidebarFooter />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-hidden />
            <aside className="animate-fade-up relative flex h-full w-72 flex-col gap-5 overflow-y-auto border-r border-border bg-surface px-3 py-4" aria-label="Navigation menu">
              <div className="flex items-center justify-between">
                <Brand />
                <Button variant="ghost" size="sm" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <X className="size-4" />
                </Button>
              </div>
              <NavList onNavigate={() => setMenuOpen(false)} />
              <SidebarFooter />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
            <WorkspaceSelector className="w-full max-w-[15rem] lg:hidden" />
            <div className="ml-auto">
              <RetrievalModeBadge />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 lg:px-8">
            <StorageBanner />
            <HydrationGate>
              <div className="animate-fade-up">{children}</div>
            </HydrationGate>
          </main>
        </div>
      </div>
    </EngineProvider>
  );
}
