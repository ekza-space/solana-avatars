import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "~/utils/cn";

export function PageSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6", className)}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          {eyebrow ? <div className="ui-eyebrow">{eyebrow}</div> : null}
          <div className="space-y-2">
            <h1 className="ui-title">{title}</h1>
            {description ? <p className="ui-copy max-w-3xl">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Panel({
  className,
  children,
  muted = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  muted?: boolean;
}) {
  return (
    <div
      className={cn(muted ? "ui-panel-muted" : "ui-panel", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Panel muted className="space-y-2">
      <div className="ui-label">{label}</div>
      <div className="font-display text-2xl font-semibold tracking-tight text-[rgb(var(--text-strong))]">
        {value}
      </div>
      {hint ? <div className="ui-copy text-sm">{hint}</div> : null}
    </Panel>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "success" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ui-badge",
        tone === "success" && "ui-badge-success",
        tone === "danger" && "ui-badge-danger",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  className,
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "ui-button",
        variant === "secondary" && "ui-button-secondary",
        variant === "ghost" && "ui-button-ghost",
        variant === "danger" && "ui-button-danger",
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
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="ui-label">{label}</span>
      {children}
      {error ? (
        <span className="text-sm font-medium text-[rgb(var(--danger))]">{error}</span>
      ) : hint ? (
        <span className="ui-copy text-sm">{hint}</span>
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
