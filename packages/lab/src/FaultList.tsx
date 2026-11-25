"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle, Check, CheckCircle2, Copy, Crosshair, Lightbulb } from "lucide-react";
import { ContextMenu } from "@kiungo/ui/menu";
import type { Fault, Severity } from "@kiungo/core/lab/circuit";
import { copyText } from "@kiungo/ui/clipboard";
import { cn } from "@kiungo/ui/cn";
import { useLabContext } from "./lab-context";

export const SEVERITY_ICON: Record<Severity, typeof AlertOctagon> = { error: AlertOctagon, warning: AlertTriangle, tip: Lightbulb };
export const SEVERITY_TEXT: Record<Severity, string> = { error: "text-danger", warning: "text-warning", tip: "text-primary" };

const SEVERITY_WORD: Record<Severity, string> = { error: "Fault", warning: "Warning", tip: "Tip" };

/** A problem as plain text, for pasting into a message, a report or a search. */
export function faultText(f: Fault, partNames: string[]): string {
  return [`${SEVERITY_WORD[f.severity]}: ${f.title}`, f.detail, partNames.length ? `Parts: ${partNames.join(", ")}` : ""].filter(Boolean).join("\n");
}

/**
 * Problems the analysis found, each a button that jumps to the part.
 * Double-click copies a problem; right-click offers Copy, Copy all and Show
 * the part. The text can also be selected and copied as usual.
 */
export function FaultList({ faults, compact = false, empty }: { faults: Fault[]; compact?: boolean; empty?: string }) {
  const { session, focusNode, select } = useLabContext();
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; fault: Fault } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const namesOf = useCallback((f: Fault) => f.nodes.map((id) => session.nodes.find((n) => n.id === id)?.label).filter((n): n is string => !!n), [session.nodes]);
  const show = (f: Fault) => {
    if (!f.nodes[0]) return;
    focusNode(f.nodes[0]);
    select([f.nodes[0]], null);
  };
  const copy = async (key: string, text: string) => {
    if (await copyText(text)) setCopied(key);
  };
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);
  if (!faults.length) {
    return (
      <p className="flex items-center gap-2 rounded-[10px] bg-success/10 px-3 py-2.5 text-[13px] text-success" data-testid="no-faults">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        {empty ?? (session.nodes.length ? "No problems found. Every wired part checks out." : "Add parts to check the circuit.")}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5" data-testid="fault-list">
      {faults.map((f) => {
        const Icon = SEVERITY_ICON[f.severity];
        const names = namesOf(f);
        return (
          <li key={f.id} className="relative">
            <button
              type="button"
              onClick={() => show(f)}
              onDoubleClick={() => void copy(f.id, faultText(f, names))}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ at: { x: event.clientX, y: event.clientY }, fault: f });
              }}
              title="Click to show the part · double-click or right-click to copy"
              className={cn(
                "w-full select-text rounded-[10px] border px-3 py-2 text-left transition-colors hover:bg-muted-bg",
                f.severity === "error" ? "border-danger/30" : f.severity === "warning" ? "border-warning/30" : "border-border",
              )}
              data-severity={f.severity}
            >
              <span className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 size-4 shrink-0", SEVERITY_TEXT[f.severity])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-5 text-foreground">{f.title}</span>
                  {!compact ? <span className="mt-0.5 block text-[12px] leading-[1.45] text-muted">{f.detail}</span> : null}
                  {names.length ? <span className="mt-1 block truncate text-[11px] font-medium text-muted">{names.join(" · ")}</span> : null}
                </span>
              </span>
            </button>
            {copied === f.id ? (
              <span role="status" className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10.5px] font-medium text-background shadow" data-testid="fault-copied">
                <Check className="size-3" aria-hidden /> Copied
              </span>
            ) : null}
          </li>
        );
      })}
      <ContextMenu
        at={menu?.at ?? null}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                { id: "copy", label: "Copy problem", icon: <Copy />, onSelect: () => void copy(menu.fault.id, faultText(menu.fault, namesOf(menu.fault))) },
                ...(faults.length > 1 ? [{ id: "copy-all", label: `Copy all ${faults.length} problems`, icon: <Copy />, onSelect: () => void copy(menu.fault.id, faults.map((f) => faultText(f, namesOf(f))).join("\n\n")) }] : []),
                ...(menu.fault.nodes[0] ? [{ id: "show", label: "Show the part", icon: <Crosshair />, onSelect: () => show(menu.fault) }] : []),
              ]
            : []
        }
      />
    </ul>
  );
}
