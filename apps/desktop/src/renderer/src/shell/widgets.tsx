import type { ReactNode } from "react";
import { cn } from "@kiungo/ui/cn";
import { Button } from "@kiungo/ui/button";

/** A small stat tile: Dashboard, Research, and a few other screens all use the same shape. */
export function Metric({ label, value, detail, tone = "primary" }: { label: string; value: string; detail: string; tone?: "primary" | "info" | "accent" | "warn" }) {
  const dot = { primary: "bg-primary", info: "bg-[var(--k-navy,#01224b)]", accent: "bg-[color-mix(in_srgb,var(--primary)_60%,var(--warning))]", warn: "bg-warning" }[tone];
  return (
    <article className="rounded-[14px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
        <span className={cn("size-2 rounded-full", dot)} />
      </div>
      <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

/** Every full-page view opens the same way: a title, a line about it, and one action. */
export function PageTitle({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </div>
      {action ? (
        <Button onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

/** A small card listing a few short facts, used by the role-aware Dashboard panels. */
export function FocusPanel({ title, icon, items }: { title: string; icon: ReactNode; items: string[] }) {
  return (
    <article className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item} className="rounded-[10px] bg-muted-bg p-2.5 text-[11px] text-muted">
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

/** One row in a Settings section: a label, a line about it, and a control. */
export function SettingRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3.5 first:border-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{title}</div>
        <div className="text-[12px] text-muted">{detail}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A heading above a block of Settings fields. */
export function SettingsHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">{detail}</p>
    </div>
  );
}

/** A plain on/off switch, for settings rows that aren't backed by a real setting yet. */
export function Toggle({ on, onChange }: { on: boolean; onChange?: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange?.(!on)}
      className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-bg")}
    >
      <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

/** A status pill ("Validated", "2 warnings", …) shared by the dashboard, projects and research cards. */
export function Pill({ tone, children }: { tone: "good" | "info" | "warn" | "neutral"; children: ReactNode }) {
  const cls = {
    good: "bg-[color-mix(in_srgb,var(--success)_14%,var(--surface))] text-success",
    info: "bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] text-primary",
    warn: "bg-[color-mix(in_srgb,var(--warning)_16%,var(--surface))] text-warning",
    neutral: "bg-muted-bg text-muted",
  }[tone];
  return <span className={cn("rounded-[8px] px-2 py-1 text-[10px] font-medium", cls)}>{children}</span>;
}
