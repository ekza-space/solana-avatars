import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "~/utils/cn";

/* --------------------------------------------------------------------------
 * Layout
 * ----------------------------------------------------------------------- */

export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

/**
 * The one page header. Title is the loudest thing on the screen; the lede is
 * optional and short; actions sit on the right and never compete with it.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-[rgb(var(--line))] pb-6 pt-2 sm:pb-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          {eyebrow ? <div className="ui-eyebrow">{eyebrow}</div> : null}
          <h1 className="ui-display">{title}</h1>
          {lede ? <p className="ui-copy max-w-2xl">{lede}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>
      {meta ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          {meta}
        </div>
      ) : null}
    </header>
  );
}

/** Section inside a page: a mono kicker + a hairline, then content. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-10 sm:mt-12", className)}>
      {title ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[rgb(var(--line))] pb-3">
          <div>
            <h2 className="ui-h3">{title}</h2>
            {description ? (
              <p className="ui-copy-sm mt-1">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------------
 * Surfaces
 * ----------------------------------------------------------------------- */

export function Card({
  className,
  children,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "default" | "quiet" }) {
  return (
    <div
      className={cn(tone === "quiet" ? "ui-card-quiet" : "ui-card", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Machine-readable key/value list. Replaces the old nested mini-panels. */
export function DataList({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode } | null | false | undefined>;
  className?: string;
}) {
  const rows = items.filter(Boolean) as Array<{
    label: string;
    value: ReactNode;
  }>;
  return (
    <dl className={cn("w-full", className)}>
      {rows.map((row) => (
        <div key={row.label} className="ui-datarow">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A single fact in the page header strip. No box, just a label over a value. */
export function Meta({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="ui-label">{label}</span>
      <span className="font-mono text-xs font-medium tabular-nums text-[rgb(var(--text-strong))]">
        {value}
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 border border-dashed border-[rgba(var(--line-strong),0.28)] p-8 sm:p-10",
        className
      )}
      style={{ borderRadius: "var(--r)" }}
    >
      <div className="space-y-2">
        <h3 className="ui-h3">{title}</h3>
        {description ? (
          <p className="ui-copy max-w-xl">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ui-skeleton", className)} aria-hidden="true" />;
}

/* --------------------------------------------------------------------------
 * Indicators
 * ----------------------------------------------------------------------- */

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "solid" | "success" | "danger" | "warning";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ui-badge",
        tone === "solid" && "ui-badge-solid",
        tone === "success" && "ui-badge-success",
        tone === "danger" && "ui-badge-danger",
        tone === "warning" && "ui-badge-warning",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Status line with a dot — colour is never the only signal, text carries it. */
export function Status({
  tone = "idle",
  children,
}: {
  tone?: "ok" | "idle" | "error";
  children: ReactNode;
}) {
  const color =
    tone === "ok"
      ? "rgb(var(--success))"
      : tone === "error"
        ? "rgb(var(--danger))"
        : "rgb(var(--text))";
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--text))]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 flex-none"
        style={{ background: color }}
      />
      {children}
    </span>
  );
}

/** Inline, non-blocking feedback for async flows. */
export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "success" | "error";
  children: ReactNode;
  className?: string;
}) {
  const accent =
    tone === "success"
      ? "rgb(var(--success))"
      : tone === "error"
        ? "rgb(var(--danger))"
        : "rgb(var(--accent-line))";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "border-l-2 bg-[rgb(var(--surface-2))] px-4 py-3 text-sm leading-relaxed text-[rgb(var(--text-strong))]",
        className
      )}
      style={{ borderLeftColor: accent }}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Controls
 * ----------------------------------------------------------------------- */

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      className={cn(
        "ui-button",
        variant === "secondary" && "ui-button-secondary",
        variant === "ghost" && "ui-button-ghost",
        variant === "danger" && "ui-button-danger",
        size === "sm" && "ui-button-sm",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={htmlFor}>
      <span className="flex items-baseline gap-2">
        <span className="ui-label">{label}</span>
        {optional ? (
          <span className="text-[11px] font-normal normal-case tracking-normal text-[rgba(var(--text),0.75)]">
            (optional)
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span
          role="alert"
          className="text-sm font-medium text-[rgb(var(--danger))]"
        >
          {error}
        </span>
      ) : hint ? (
        <span className="ui-copy-sm text-[13px]">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("ui-input", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("ui-textarea", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("ui-select", props.className)} />;
}
