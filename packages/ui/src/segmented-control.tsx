"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Longer name for assistive technology and tooltips. */
  description?: string;
  /** A sentence or two shown from a small "i" button in the option's corner. */
  info?: string;
}

/**
 * A segmented control: one choice from a few, shown side by side.
 * Keyboard: arrow keys move the choice, like a radio group.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full rounded-[12px] border border-border bg-muted-bg p-1", className)}>
      {options.map((option, index) => {
        const checked = option.id === value;
        const radio = (
          <button
            key={option.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.description ? `${option.label}: ${option.description}` : undefined}
            title={option.description}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] font-medium [&>svg]:shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              // Room for the "i" in the corner.
              option.info && (size === "sm" ? "pr-4" : "pr-5"),
              checked ? "bg-surface text-foreground shadow-[var(--shadow-sm)]" : "text-muted hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
        if (!option.info) return radio;
        return (
          <div key={option.id} className="relative flex flex-1">
            {radio}
            <InfoButton label={option.label} text={option.info} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * A tiny "i" tucked into the option's bottom-right corner. It sits beside
 * the radio, not inside it (a button can't contain a button), and opens a
 * short note below the control. Escape, a second click or a click elsewhere
 * closes it.
 */
function InfoButton({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="absolute bottom-0.5 right-0.5 z-10 flex">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full border p-0 font-serif text-[8.5px] font-bold italic leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]",
          open ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted hover:border-primary hover:text-primary",
        )}
        data-testid={`info-${label}`}
      >
        i
      </button>
      {open ? (
        <span id={id} role="note" className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-[10px] border border-border bg-surface p-3 text-left text-[12px] font-normal not-italic leading-5 text-foreground shadow-[var(--shadow-md)]" data-testid={`info-note-${label}`}>
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label} view</span>
          {text}
        </span>
      ) : null}
    </span>
  );
}
