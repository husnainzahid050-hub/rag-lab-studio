"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type IconComponent = ComponentType<{ className?: string }>;
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-glow hover:brightness-110 border border-transparent",
  secondary: "bg-surface text-fg border border-border shadow-card hover:border-border-strong hover:bg-surface-2",
  ghost: "text-fg hover:bg-surface-2 border border-transparent",
  danger: "bg-surface text-danger border border-border hover:bg-danger-soft hover:border-danger/40",
};

type ButtonSize = "sm" | "md" | "lg";

/** Button styling, also used for links that should look like buttons. */
export function buttonClassName(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-8 px-2.5 text-xs" : size === "lg" ? "h-11 px-5 text-sm" : "h-9 px-3.5 text-sm",
    BUTTON_VARIANTS[variant],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: IconComponent;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon className="size-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent-soft text-accent border-accent/25",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  info: "bg-info-soft text-info border-info/25",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const ICON_TILE_TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function IconTile({ icon: Icon, tone = "accent", className }: { icon: IconComponent; tone?: Tone; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_TILE_TONES[tone], className)}>
      <Icon className="size-4" />
    </span>
  );
}

const ALERT_ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof ALERT_ICONS;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = ALERT_ICONS[tone];
  const tones = {
    info: "bg-info-soft text-info border-info/20",
    success: "bg-success-soft text-success border-success/20",
    warning: "bg-warning-soft text-warning border-warning/20",
    danger: "bg-danger-soft text-danger border-danger/20",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm", tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-fg">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn("text-[13px]", title ? "mt-0.5 text-muted" : "")}>{children}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const INPUT_CLASS =
  "rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-card placeholder:text-muted/70 transition-colors focus:border-accent focus:ring-4 focus:ring-accent/10 focus:outline-none aria-[invalid=true]:border-danger";

/** Full width unless the caller sets its own width class. */
function widthOrFull(className?: string) {
  return /(^|\s)(w-|max-w-|min-w-)/.test(className ?? "") ? "" : "w-full";
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(INPUT_CLASS, widthOrFull(className), "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(INPUT_CLASS, widthOrFull(className), "py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(INPUT_CLASS, widthOrFull(className), "h-9 pr-8", className)} {...props} />;
}

/** Radio-group styled as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40",
            value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconComponent;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl bg-accent-soft p-3.5 text-accent ring-8 ring-accent-soft/40">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={cn("bg-brand h-full rounded-full transition-[width]", value === null && "w-1/3 animate-pulse")}
        style={value === null ? undefined : { width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconComponent;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <IconTile icon={icon} tone={tone} className="size-7 rounded-md" />}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: IconComponent;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 max-w-3xl items-start gap-3.5">
        {Icon && (
          <span className="bg-brand shadow-glow hidden size-11 shrink-0 items-center justify-center rounded-xl text-white sm:flex">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-semibold tracking-wider text-accent uppercase">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A button that asks for a second click before running a destructive action. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm",
  size = "sm",
  ...props
}: Omit<ComponentProps<"button">, "onClick"> & { onConfirm: () => void; confirmLabel?: string; size?: "sm" | "md" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant="danger"
      size={size}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      {...props}
      // Once armed, the accessible name must announce the confirmation step, not the original label.
      aria-label={armed ? confirmLabel : props["aria-label"]}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/** Side sheet used for inspecting a chunk. Closes with Escape or the close button and returns focus. */
export function SidePanel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-fade-up relative flex h-full w-full max-w-xl flex-col border-l border-border bg-surface shadow-lift"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </h2>
          <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
