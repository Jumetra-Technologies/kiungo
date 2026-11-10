"use client";

import { useMemo, useState } from "react";
import { BookOpen, Box, Cable, Copy, Grid2x2, Scissors, Trash2, Wand2, Zap } from "lucide-react";
import { PartModel3D } from "./views/PartModel3D";
import { PartPlanView } from "./views/PartPlanView";
import { PartFlowView } from "./views/PartFlowView";
import { SegmentedControl } from "@kiungo/ui/segmented-control";
import { Button } from "@kiungo/ui/button";
import { getPart, hasScreen, withScreenText } from "@kiungo/core/parts";
import { withResistorValue } from "@kiungo/core/parts/models/passives";
import { ohmsOf } from "@kiungo/core/lab/controls";
import { getPinout, pinTone } from "@kiungo/core/lab/pinout";
import { breadboardUse } from "@kiungo/core/lab/breadboard";
import { useLab } from "./store";
import type { DeviceMode } from "@kiungo/core/lab/types";
import { VIEW_COPY } from "@kiungo/ui/views";
import { cn } from "@kiungo/ui/cn";
import { FaultList } from "./FaultList";
import { InputsPanel } from "./InputsPanel";
import { useLabContext, useLabHost } from "./lab-context";
import { STATUS_TEXT, TONE_VAR } from "./PartNode";

type PreviewView = "model" | "plan" | "flow";

const STATUS_PILL = {
  idle: "bg-muted-bg text-muted",
  unpowered: "bg-warning/15 text-warning",
  partial: "bg-warning/15 text-warning",
  ready: "bg-success/12 text-success",
  fault: "bg-danger/12 text-danger",
} as const;

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4 last:border-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function NodeInspector({ id }: { id: string }) {
  const { session, analysis, frame, autowireNode, select } = useLabContext();
  const host = useLabHost();
  const renameNode = useLab((s) => s.renameNode);
  const removeNodes = useLab((s) => s.removeNodes);
  const removeWires = useLab((s) => s.removeWires);
  const duplicateNodes = useLab((s) => s.duplicateNodes);
  const setNodeMode = useLab((s) => s.setNodeMode);
  const [preview, setPreview] = useState<PreviewView>("model");
  const [feature, setFeature] = useState<string | null>(null);
  const node = session.nodes.find((n) => n.id === id);
  const part = node ? getPart(node.partId) : undefined;
  const pinout = node ? getPinout(node.partId) : null;
  const report = analysis.nodes[id];
  const live = frame.nodes[id];

  const wiresOf = useMemo(() => session.wires.filter((w) => w.from.node === id || w.to.node === id), [session.wires, id]);
  // The preview is this part in the lab, not the library's: a display's glass shows what the sketch
  // wrote this frame (the same lines as on the canvas), or nothing. Never the library's sample text.
  // withScreenText caches per model and text, so this is cheap on every frame.
  const shown = part && hasScreen(part) ? withScreenText(part, live?.text ?? []) : part && node?.partId === "resistor" ? withResistorValue(part, ohmsOf(session.inputs, node.id)) : part;
  if (!node || !pinout) return null;

  const otherEnd = (pin: string) =>
    wiresOf
      .filter((w) => (w.from.node === id && w.from.pin === pin) || (w.to.node === id && w.to.pin === pin))
      .map((w) => {
        const end = w.from.node === id && w.from.pin === pin ? w.to : w.from;
        const other = session.nodes.find((n) => n.id === end.node);
        const p = other ? getPinout(other.partId).pins.find((x) => x.id === end.pin) : undefined;
        return `${other?.label ?? "?"} ${p?.label ?? end.pin}`;
      });

  const status = report?.status ?? "idle";
  return (
    <div data-testid="node-inspector">
      <div className="border-b border-border px-4 pb-4 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <input
              key={node.id + node.label}
              defaultValue={node.label}
              aria-label="Part name"
              onBlur={(e) => renameNode(node.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold text-foreground outline-none hover:border-border focus:border-primary"
            />
            <p className="px-1 text-xs text-muted">{part?.name}</p>
          </div>
          <span className={cn("mt-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_PILL[status])}>{STATUS_TEXT[status]}</span>
        </div>
        {part ? (
          <>
            <SegmentedControl
              value={preview}
              onChange={setPreview}
              label="Preview"
              size="sm"
              className="mt-3 w-full"
              options={[
                { id: "model", label: VIEW_COPY["3d"].label, icon: <Box className="size-3.5" aria-hidden />, description: VIEW_COPY["3d"].description },
                { id: "plan", label: VIEW_COPY["2d"].label, icon: <Grid2x2 className="size-3.5" aria-hidden />, description: VIEW_COPY["2d"].description },
                { id: "flow", label: VIEW_COPY.trace.label, icon: <Zap className="size-3.5" aria-hidden />, description: VIEW_COPY.trace.description },
              ]}
            />
            <div className={cn("mt-2 overflow-hidden rounded-[12px] border border-border bg-canvas", preview === "flow" ? "h-64" : "h-52")}>
              {preview === "model" ? <PartModel3D model={shown!} powered={!!live?.on || (pinout.controller && !!report?.powered)} /> : preview === "plan" ? <PartPlanView model={shown!} powered={!!live?.on} activeFeature={feature} onFeature={setFeature} className="h-full" /> : <PartFlowView model={shown!} powered={!!live?.on || (pinout.controller && !!report?.powered)} className="h-full" compact />}
            </div>
            {preview === "flow" && part.circuit.steps.length ? (
              <details className="group mt-2 rounded-[10px] border border-border bg-surface px-3 py-2" data-testid="inspector-flow-steps">
                <summary className="cursor-pointer list-none text-[12px] font-medium text-foreground marker:hidden">
                  How it works <span className="text-muted">· {part.circuit.steps.length} steps</span>
                </summary>
                <ol className="mt-2 space-y-1.5 text-[12px] leading-5">
                  {part.circuit.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted-bg font-mono text-[10px] font-semibold">
                        {i + 1}
                      </span>
                      <span className="text-muted">{step}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!pinout.controller && status !== "ready" ? (
            <Button size="sm" onClick={() => autowireNode(node.id)} data-testid="inspector-autowire">
              <Wand2 className="size-3.5" aria-hidden /> Auto-wire
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => select(duplicateNodes([node.id]).map((n) => n.id), null)}>
            <Copy className="size-3.5" aria-hidden /> Duplicate
          </Button>
          {wiresOf.length ? (
            <Button size="sm" variant="secondary" onClick={() => removeWires(wiresOf.map((w) => w.id))}>
              <Scissors className="size-3.5" aria-hidden /> Unwire
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => removeNodes([node.id])} aria-label={`Delete ${node.label}`}>
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </Button>
        </div>
      </div>

      {live?.readings.length ? (
        <Section title="Live">
          <dl className="grid grid-cols-2 gap-2">
            {live.readings.map((r) => (
              <div key={r.label} className="rounded-[10px] bg-muted-bg px-2.5 py-2">
                <dt className="text-[11px] text-muted">{r.label}</dt>
                <dd className="truncate font-mono text-[13px] font-semibold tabular-nums text-foreground">{r.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      <InputsPanel node={node} />

      <Section title={`Problems${report?.faults.length ? ` · ${report.faults.length}` : ""}`}>
        <FaultList faults={report?.faults ?? []} empty={status === "idle" ? "Not wired yet. Drag from a pin, or use Auto-wire." : "No problems with this part."} />
      </Section>

      {pinout.strips ? (
        <Section title="Strips in use">
          <BreadboardStrips nodeId={node.id} />
        </Section>
      ) : (
        <Section title="Pins">
          <ul className="divide-y divide-border/70 text-[12.5px]" data-testid="pin-table">
            {pinout.pins.map((pin) => {
              const ends = otherEnd(pin.id);
              return (
                <li key={pin.id} className="flex items-start gap-2 py-1.5" title={pin.note}>
                  <span className="mt-1 size-2.5 shrink-0 rounded-full border-2" style={{ borderColor: TONE_VAR[pinTone(pin)], background: ends.length ? TONE_VAR[pinTone(pin)] : "transparent" }} aria-hidden />
                  <span className="w-24 shrink-0 font-mono text-[11.5px] text-foreground">{pin.label}</span>
                  <span className={cn("min-w-0 flex-1 truncate", ends.length ? "text-foreground" : pin.required ? "text-warning" : "text-muted")}>{ends.length ? ends.join(", ") : pin.required ? "Needs a wire" : pin.note ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Device">
        {pinout.passive ? (
          <p className="text-[12.5px] leading-5 text-muted">{pinout.strips ? "A breadboard has no electronics of its own: it only joins what you plug into it, in the lab and on the bench alike." : "A resistor works the same in the lab and on the bench: there is nothing to connect to Kiungo."}</p>
        ) : (
          <>
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-foreground">Mode</span>
              <select value={node.mode} onChange={(e) => setNodeMode(node.id, e.target.value as DeviceMode)} className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[13px]" aria-label="Device mode">
                <option value="virtual">Virtual (simulated)</option>
                <option value="hybrid">Hybrid (real + simulated)</option>
                <option value="physical">Physical (real hardware)</option>
              </select>
            </label>
            <p className="mt-2 text-[11.5px] leading-4 text-muted">{host.modeNote?.(node) ?? "Physical and hybrid parts use a real board when it is plugged in and Kiungo is online."}</p>
          </>
        )}
        {part && host.renderPartLink
          ? host.renderPartLink(
              part.id,
              <>
                <BookOpen className="size-3.5" aria-hidden /> Open in Component library
              </>,
              "mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline",
            )
          : null}
      </Section>
    </div>
  );
}

/** A breadboard's wired strips: what each carries and what else is on it. 400 holes would make a useless pin table. */
function BreadboardStrips({ nodeId }: { nodeId: string }) {
  const { analysis, session } = useLabContext();
  const use = useMemo(() => breadboardUse(nodeId, analysis, session.nodes), [nodeId, analysis, session.nodes]);
  if (!use.length) {
    return <p className="text-[12.5px] leading-5 text-muted">Nothing wired yet. Run the board&apos;s 5V and GND to the top + and − rails, then take each part&apos;s VCC and GND from the rails.</p>;
  }
  const tone = (kind: string) => (kind === "power" ? TONE_VAR.power : kind === "ground" ? TONE_VAR.ground : kind === "short" || kind === "conflict" ? "var(--lab-fault)" : kind === "open" ? TONE_VAR.muted : TONE_VAR.digital);
  return (
    <ul className="divide-y divide-border/70 text-[12.5px]" data-testid="strip-table">
      {use.map((u) => (
        <li key={u.id} className="flex items-start gap-2 py-1.5">
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: tone(u.kind) }} aria-hidden />
          <span className="w-28 shrink-0 text-foreground">
            {u.name}
            <span className="block font-mono text-[10.5px] text-muted">{u.kind === "power" ? u.net : u.kind === "ground" ? "GND" : u.kind === "open" ? "No other end" : u.net}</span>
          </span>
          <span className="min-w-0 flex-1 text-muted">{u.ends.length ? u.ends.join(", ") : "Only this strip"}</span>
        </li>
      ))}
    </ul>
  );
}

function WireInspector({ id }: { id: string }) {
  const { session, analysis, frame, select } = useLabContext();
  const removeWires = useLab((s) => s.removeWires);
  const wire = session.wires.find((w) => w.id === id);
  if (!wire) return null;
  const end = (ref: { node: string; pin: string }) => {
    const n = session.nodes.find((x) => x.id === ref.node);
    const p = n ? getPinout(n.partId).pins.find((x) => x.id === ref.pin) : undefined;
    return { node: n, pin: p };
  };
  const a = end(wire.from);
  const b = end(wire.to);
  const net = analysis.nets.find((n) => n.id === analysis.netOfWire.get(wire.id));
  const live = frame.wires[wire.id];
  const faults = analysis.faults.filter((f) => f.wires.includes(wire.id));
  const flowText = !live ? "—" : live.flow === "fault" ? "Faulty" : live.level > 0.05 ? (live.flow === "power" ? "Carrying current" : live.flow === "ground" ? "Returning current" : live.flow === "data" ? "Data moving" : "Signal high") : live.flow === "power" || live.flow === "ground" ? "No load yet" : "Low / idle";
  return (
    <div data-testid="wire-inspector">
      <div className="border-b border-border px-4 py-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Cable className="size-4 text-muted" aria-hidden /> Wire
        </p>
        <div className="mt-3 space-y-2 text-[13px]">
          {[a, b].map((e, i) => (
            <button key={i} type="button" onClick={() => e.node && select([e.node.id], null)} className="flex w-full items-center gap-2 rounded-[10px] bg-muted-bg px-3 py-2 text-left hover:bg-accent">
              <span className="size-2.5 rounded-full" style={{ background: e.pin ? TONE_VAR[pinTone(e.pin)] : "var(--muted)" }} aria-hidden />
              <span className="font-medium text-foreground">{e.node?.label}</span>
              <span className="ml-auto font-mono text-[12px] text-muted">{e.pin?.label}</span>
            </button>
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
          <div className="rounded-[10px] border border-border px-2.5 py-2">
            <dt className="text-[11px] text-muted">Net</dt>
            <dd className="font-medium text-foreground">{net?.label ?? "—"}</dd>
          </div>
          <div className="rounded-[10px] border border-border px-2.5 py-2">
            <dt className="text-[11px] text-muted">Right now</dt>
            <dd className="font-medium text-foreground">{flowText}</dd>
          </div>
        </dl>
        <Button size="sm" variant="ghost" className="mt-3 text-danger" onClick={() => removeWires([wire.id])}>
          <Trash2 className="size-3.5" aria-hidden /> Delete wire
        </Button>
      </div>
      {faults.length ? (
        <Section title="Problems">
          <FaultList faults={faults} />
        </Section>
      ) : null}
    </div>
  );
}

function Overview() {
  const { session, analysis } = useLabContext();
  const host = useLabHost();
  const counts = { ready: 0, attention: 0, fault: 0 };
  for (const n of session.nodes) {
    const s = analysis.nodes[n.id]?.status;
    if (s === "ready") counts.ready++;
    else if (s === "fault") counts.fault++;
    else counts.attention++;
  }
  const errors = analysis.faults.filter((f) => f.severity === "error").length;
  return (
    <div data-testid="overview-inspector">
      <div className="border-b border-border px-4 py-4">
        <p className="text-base font-semibold text-foreground">Circuit check</p>
        <p className="mt-0.5 text-[12.5px] text-muted">Select a part or wire to inspect it.</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[10px] bg-success/10 px-2 py-2">
            <dd className="text-lg font-semibold tabular-nums text-success">{counts.ready}</dd>
            <dt className="text-[11px] text-muted">Ready</dt>
          </div>
          <div className="rounded-[10px] bg-warning/12 px-2 py-2">
            <dd className="text-lg font-semibold tabular-nums text-warning">{counts.attention}</dd>
            <dt className="text-[11px] text-muted">To wire</dt>
          </div>
          <div className="rounded-[10px] bg-danger/10 px-2 py-2">
            <dd className="text-lg font-semibold tabular-nums text-danger">{counts.fault}</dd>
            <dt className="text-[11px] text-muted">Faults</dt>
          </div>
        </dl>
      </div>
      <Section title={`Problems${analysis.faults.length ? ` · ${analysis.faults.length}` : ""}`}>
        <FaultList faults={analysis.faults} />
        {errors ? <p className="mt-2 text-[11.5px] text-muted">Switch to Trace to see where current stops.</p> : null}
      </Section>
      {host.realHardware ? <Section title="Real hardware">{host.realHardware}</Section> : null}
      <Section title="Legend">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-foreground">
          {(
            [
              ["power", "Power"],
              ["ground", "Ground"],
              ["digital", "Digital"],
              ["pwm", "PWM"],
              ["analog", "Analog"],
              ["bus", "I²C / SPI / UART"],
            ] as const
          ).map(([tone, label]) => (
            <li key={tone} className="flex items-center gap-2">
              <span className="h-1 w-5 rounded-full" style={{ background: TONE_VAR[tone] }} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function Inspector() {
  const { selectedNodes, selectedWire } = useLabContext();
  if (selectedNodes.length === 1) return <NodeInspector id={selectedNodes[0]} />;
  if (selectedWire && !selectedNodes.length) return <WireInspector id={selectedWire} />;
  return <Overview />;
}
