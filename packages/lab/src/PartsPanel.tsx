"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { billOfMaterials, bomCsv, bomText, partReadiness, type PartRunStatus } from "@kiungo/core/hybrid/readiness";
import { copyText } from "@kiungo/ui/clipboard";
import { cn } from "@kiungo/ui/cn";
import { SegmentedControl } from "@kiungo/ui/segmented-control";
import { useLabContext } from "./lab-context";

const STATUS: Record<PartRunStatus, { label: string; tone: string }> = {
  virtual: { label: "Virtual", tone: "bg-muted-bg text-muted" },
  real: { label: "Real", tone: "bg-success/12 text-success" },
  hybrid: { label: "Hybrid", tone: "bg-primary/12 text-primary" },
  unavailable: { label: "Not available", tone: "bg-danger/12 text-danger" },
};

/**
 * Parts (VER-01, VER-03): where each part lives in a run (Virtual, Real or
 * Hybrid, set by Mode in the Inspector), and what to have on the desk.
 */
export function PartsPanel({ fileName }: { fileName: string }) {
  const { session, analysis, focusNode, select } = useLabContext();
  const [scope, setScope] = useState<"desk" | "all">("desk");
  const [copied, setCopied] = useState(false);
  const rows = useMemo(() => partReadiness(session.nodes, analysis), [session.nodes, analysis]);
  const bom = useMemo(() => billOfMaterials(session.nodes, session.wires, scope), [session.nodes, session.wires, scope]);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const saveCsv = () => {
    const url = URL.createObjectURL(new Blob([bomCsv(bom)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName} parts${scope === "desk" ? " (desk)" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!session.nodes.length) return <p className="p-3 text-[13px] text-muted">Add parts to see where each one runs and what to buy.</p>;

  return (
    <div className="@container hhip-scroll h-full overflow-y-auto" data-testid="parts-panel">
      <div className="grid gap-4 p-3 @[720px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="parts-run">
          <h3 id="parts-run" className="mb-2 text-[12.5px] font-semibold text-foreground">
            In a run
          </h3>
          <ul className="divide-y divide-border rounded-[10px] border border-border" data-testid="part-status">
            {rows.map((r) => (
              <li key={r.nodeId}>
                <button
                  type="button"
                  onClick={() => {
                    focusNode(r.nodeId);
                    select([r.nodeId], null);
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted-bg/60"
                  data-status={r.status}
                >
                  <span className={cn("mt-0.5 inline-flex w-[6.5rem] shrink-0 justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[r.status].tone)}>{STATUS[r.status].label}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{r.label}</span>
                    <span className="block text-[12px] leading-[1.45] text-muted">{r.why}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-4 text-muted">Change where a part runs with Mode in the Inspector.</p>
        </section>

        <section aria-labelledby="parts-bom">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 id="parts-bom" className="mr-auto text-[12.5px] font-semibold text-foreground">
              What you need
            </h3>
            <SegmentedControl
              value={scope}
              onChange={setScope}
              options={[
                { id: "desk", label: "On the desk" },
                { id: "all", label: "Everything" },
              ]}
              label="Which parts to list"
              size="sm"
            />
          </div>
          {bom.length ? (
            <table className="w-full text-[12.5px]" data-testid="bom">
              <thead className="sr-only">
                <tr>
                  <th>Quantity</th>
                  <th>Part</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bom.map((l) => (
                  <tr key={l.id}>
                    <td className="w-10 py-1.5 pr-2 align-top font-mono tabular-nums text-foreground">{l.quantity}×</td>
                    <td className="py-1.5 align-top">
                      <span className="text-foreground">{l.name}</span>
                      {l.note ? <span className="block text-[11.5px] leading-4 text-muted">{l.note}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12.5px] text-muted">Nothing is on the desk yet: every part is Virtual. Mark the board and the parts you have as Physical.</p>
          )}
          {bom.length ? (
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={async () => setCopied(await copyText(bomText(bom)))} className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-border px-2 text-[12px] font-medium text-foreground hover:bg-muted-bg" data-testid="bom-copy">
                {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy list"}
              </button>
              <button type="button" onClick={saveCsv} className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-border px-2 text-[12px] font-medium text-foreground hover:bg-muted-bg" data-testid="bom-csv">
                <Download className="size-3.5" aria-hidden />
                Save CSV
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
