"use client";

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Cpu, Grid3x3, Lightbulb, Monitor, Radio, Thermometer, Usb, Zap } from "lucide-react";
import { PartModel3D } from "./views/PartModel3D";
import { PartPlanGraphic } from "./views/PartPlanView";
import { getPart, hasScreen, withScreenText } from "@kiungo/core/parts";
import { withResistorValue } from "@kiungo/core/parts/models/passives";
import { ohmsOf } from "@kiungo/core/lab/controls";
import { getPinout, pinTone, type LabPin, type PinTone } from "@kiungo/core/lab/pinout";
import type { PowerState } from "./UsbCable";
import { NODE, nodeLayout, pinY } from "@kiungo/core/lab/layout";
import type { PartStatus } from "@kiungo/core/lab/circuit";
import type { LabNode } from "@kiungo/core/lab/types";
import { cn } from "@kiungo/ui/cn";
import { useLabContext } from "./lab-context";
import { CONNECTOR_NAME, UsbCable, connectorFor } from "./UsbCable";
import type { BoardGeometry } from "@kiungo/core/lab/board-geometry";
import { BreadboardNode } from "./BreadboardNode";

export type PartNodeData = { node: LabNode };

export const TONE_VAR: Record<PinTone, string> = {
  power: "var(--lab-power)",
  ground: "var(--lab-ground)",
  digital: "var(--lab-digital)",
  analog: "var(--lab-analog)",
  pwm: "var(--lab-pwm)",
  bus: "var(--lab-bus)",
  muted: "var(--lab-muted)",
};

export const STATUS_TEXT: Record<PartStatus, string> = {
  idle: "Not wired",
  unpowered: "No power",
  partial: "Needs wiring",
  ready: "Ready",
  fault: "Fault",
};

const STATUS_DOT: Record<PartStatus, string> = {
  idle: "bg-[var(--lab-muted)]",
  unpowered: "bg-warning",
  partial: "bg-warning",
  ready: "bg-success",
  fault: "bg-danger",
};

const GROUP_ICON = { boards: Cpu, prototyping: Grid3x3, sensors: Thermometer, outputs: Lightbulb, displays: Monitor, radios: Radio } as const;

function PinRow({ pin, index, side, nodeId, connected, faulty, live, w, partLabel }: { pin: LabPin; index: number; side: "left" | "right"; nodeId: string; connected: string | null; faulty: boolean; live: boolean; w: number; partLabel: string }) {
  const tone = pinTone(pin);
  const color = TONE_VAR[tone];
  const y = pinY(index);
  const title = [`${partLabel} ${pin.label}`, pin.note, connected ? `Wired to ${connected}` : "Not wired: drag from here to another pin"].filter(Boolean).join("\n");
  return (
    <>
      <Handle
        id={pin.id}
        type="source"
        position={side === "left" ? Position.Left : Position.Right}
        title={title}
        aria-label={`${pin.label} pin`}
        data-pin={pin.id}
        data-node={nodeId}
        className={cn("!size-[11px] !rounded-full !border-2 transition-transform hover:!scale-150", faulty && "hhip-fault-pulse")}
        style={{
          top: y,
          left: side === "left" ? 0 : undefined,
          right: side === "right" ? 0 : undefined,
          background: connected ? color : "var(--surface)",
          borderColor: faulty ? "var(--lab-fault)" : color,
          boxShadow: live ? `0 0 0 3px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
        }}
      />
      <span
        className={cn(
          "pointer-events-none absolute truncate font-mono text-[10px] leading-none",
          connected ? "text-foreground" : "text-muted",
          faulty && "text-danger",
        )}
        style={{ top: y - 5, width: NODE.railLabel - 14, ...(side === "left" ? { left: 10 } : { left: w - NODE.railLabel + 4, textAlign: "right" }) }}
      >
        {pin.label}
      </span>
    </>
  );
}

function FlowBody({ node, slot, status, badge, on, left, right, live }: { node: LabNode; slot: { x: number; y: number; w: number; h: number }; status: PartStatus; badge?: string; on: boolean; left: LabPin[]; right: LabPin[]; live: (pin: string) => boolean }) {
  const part = getPart(node.partId);
  const pinout = getPinout(node.partId);
  const Icon = pinout.controller ? Cpu : GROUP_ICON[part?.group ?? "sensors"];
  const bx = slot.x + 18;
  const bw = slot.w - 36;
  const by = slot.y + 12;
  const bh = slot.h - 24;
  const w = nodeLayout(node.partId).w;
  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" width={w} height={slot.y + slot.h + 10} aria-hidden>
      {/* Traces from each pin into the part */}
      {left.map((pin, i) => {
        const y = pinY(i);
        const color = TONE_VAR[pinTone(pin)];
        const ty = Math.max(by + 8, Math.min(by + bh - 8, y));
        const d = `M 7 ${y} H ${slot.x - 4} C ${slot.x + 8} ${y}, ${bx - 12} ${ty}, ${bx} ${ty}`;
        return (
          <g key={pin.id}>
            <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} />
            {live(pin.id) ? <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 8" className="hhip-live-dash" /> : null}
          </g>
        );
      })}
      {right.map((pin, i) => {
        const y = pinY(i);
        const color = TONE_VAR[pinTone(pin)];
        const ty = Math.max(by + 8, Math.min(by + bh - 8, y));
        const rx = w - NODE.railLabel + 4;
        const d = `M ${w - 7} ${y} H ${rx} C ${rx - 12} ${y}, ${bx + bw + 12} ${ty}, ${bx + bw} ${ty}`;
        return (
          <g key={pin.id}>
            <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} />
            {live(pin.id) ? <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 8" className="hhip-live-dash" /> : null}
          </g>
        );
      })}
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        rx={10}
        fill={on ? "color-mix(in srgb, var(--success) 10%, var(--surface))" : "var(--surface)"}
        stroke={status === "fault" ? "var(--lab-fault)" : on ? "var(--success)" : "var(--border)"}
        strokeWidth={status === "fault" || on ? 1.6 : 1}
        className={status === "fault" ? "hhip-fault-pulse" : undefined}
      />
      <foreignObject x={bx} y={by} width={bw} height={bh}>
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
          <Icon className={cn("size-5", on ? "text-success" : status === "fault" ? "text-danger" : "text-muted")} />
          <span className="max-w-full truncate text-[11px] font-semibold text-foreground">{pinout.controller ? `MCU · ${pinout.logic} V logic` : part?.group === "prototyping" ? (part.name.split(" (")[0] ?? "part").toLowerCase() : (part?.group ?? "part").replace(/s$/, "")}</span>
          {badge ? <span className={cn("max-w-full truncate font-mono text-sm font-semibold tabular-nums", on ? "text-success" : "text-muted")}>{badge}</span> : null}
          {pinout.controller ? (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted">
              <Usb className="size-3" /> USB 5 V in
            </span>
          ) : pinout.supply ? (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted">
              <Zap className="size-3" /> {pinout.supply[0]}–{pinout.supply[1]} V
            </span>
          ) : null}
        </div>
      </foreignObject>
    </svg>
  );
}

function PartNodeView({ id, data, selected }: NodeProps & { data: PartNodeData }) {
  const { analysis, frame, view, flash, session, power } = useLabContext();
  const node = data.node;
  const part = getPart(node.partId);
  const pinout = getPinout(node.partId);
  const layout = nodeLayout(node.partId, view);
  const report = analysis.nodes[id];
  const status: PartStatus = report?.status ?? "idle";
  const live = frame.nodes[id];
  const on = !!live?.on;

  // Who each pin is wired to, for labels and tooltips.
  const connections = useMemo(() => {
    const map = new Map<string, string>();
    const label = (nid: string, pid: string) => {
      const other = session.nodes.find((n) => n.id === nid);
      const pin = other ? getPinout(other.partId).pins.find((p) => p.id === pid) : undefined;
      return other ? `${other.label} ${pin?.label ?? pid}` : pid;
    };
    for (const w of session.wires) {
      if (w.from.node === id) map.set(w.from.pin, [map.get(w.from.pin), label(w.to.node, w.to.pin)].filter(Boolean).join(", "));
      if (w.to.node === id) map.set(w.to.pin, [map.get(w.to.pin), label(w.from.node, w.from.pin)].filter(Boolean).join(", "));
    }
    return map;
  }, [session.wires, session.nodes, id]);

  const faultyPins = useMemo(() => {
    const set = new Set<string>();
    for (const f of report?.faults ?? []) {
      if (f.severity === "tip") continue;
      for (const pin of pinout.pins) if (f.id.includes(`:${pin.id}:`)) set.add(pin.id);
    }
    return set;
  }, [report, pinout.pins]);

  const pinLive = (pin: string) => {
    if (!frame.running && view !== "flow") return false;
    const net = analysis.nets.find((n) => n.id === analysis.netOfPin.get(`${id}:${pin}`));
    if (!net || !net.wires.length) return false;
    return net.wires.some((w) => (frame.wires[w]?.level ?? 0) > 0.05);
  };

  const errors = report?.faults.filter((f) => f.severity === "error").length ?? 0;
  const warnings = report?.faults.filter((f) => f.severity === "warning").length ?? 0;
  const lit = on || (pinout.controller && report?.powered);
  const litIds = useMemo(() => {
    if (!part?.animate?.lit) return undefined;
    if (pinout.controller) {
      // Power LED whenever powered; the user LED ("L", GPIO2, PC13, ACT) only while it blinks.
      const power = part.animate.lit.filter((sid) => /pwr|^led-on$/.test(sid));
      const user = part.animate.lit.filter((sid) => !power.includes(sid));
      return [...power, ...((live?.level ?? 0) > 0 ? user : [])];
    }
    return part.animate.lit;
  }, [part, pinout.controller, live?.level]);

  // A display's glass shows what the sketch wrote this frame, or nothing: never the library's sample text.
  const screen = !!part && hasScreen(part);
  const text = live?.text;
  const ohms = node.partId === "resistor" ? ohmsOf(session.inputs, node.id) : 0;
  const shown = useMemo(() => (part && screen ? withScreenText(part, text ?? []) : part && ohms ? withResistorValue(part, ohms) : part), [part, screen, text, ohms]);

  if (layout.bare && part && pinout.passive) {
    return (
      <BreadboardNode
        id={id}
        node={node}
        part={part}
        geometry={layout.bare}
        view={view}
        status={status}
        selected={selected}
        flashed={flash.includes(id)}
        caption={<BareCaption node={node} status={status} lit={false} errors={errors} warnings={warnings} badge={live?.badge} on={!!live?.badge} />}
        connections={connections}
        pinLive={pinLive}
      />
    );
  }

  if (layout.bare && part) {
    return (
      <BareBoard
        id={id}
        node={node}
        part={part}
        geometry={layout.bare}
        status={status}
        badge={live?.badge}
        errors={errors}
        warnings={warnings}
        selected={selected}
        flashed={flash.includes(id)}
        view={view}
        lit={!!lit}
        litIds={litIds}
        power={power}
        connections={connections}
        faultyPins={faultyPins}
        pinLive={pinLive}
      />
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded-[14px] border bg-surface text-foreground shadow-[var(--shadow-sm)] transition-[box-shadow,border-color] duration-200",
        selected ? "border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent),var(--shadow-md)]" : status === "fault" ? "border-danger/70" : "border-border hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]",
        flash.includes(id) && "ring-4 ring-warning/60",
      )}
      style={{ width: layout.w, height: layout.h }}
      data-testid="lab-node"
      data-part={node.partId}
      data-status={status}
    >
      {pinout.controller ? <UsbCable connector={connectorFor(node.partId)} state={power} /> : null}

      {/* Header */}
      <div className="flex h-[46px] items-center gap-2 border-b border-border px-3">
        <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[status], status === "ready" && on && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_25%,transparent)]")} title={STATUS_TEXT[status]} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-4">{node.label}</p>
          <p className="truncate text-[10.5px] leading-4 text-muted">
            {STATUS_TEXT[status]}
            {node.mode !== "virtual" ? ` · ${node.mode}` : ""}
          </p>
        </div>
        {errors || warnings ? (
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", errors ? "bg-danger/12 text-danger" : "bg-warning/15 text-warning")} title={`${errors} errors, ${warnings} warnings`}>
            <AlertTriangle className="size-3" aria-hidden />
            {errors + warnings}
          </span>
        ) : null}
        {live?.badge ? (
          <span className={cn("max-w-[7.5rem] shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums transition-colors", on ? "bg-success/12 text-success" : "bg-muted-bg text-muted")} data-testid="node-badge">
            {live.badge}
          </span>
        ) : null}
      </div>

      {/* Body by view */}
      {part ? (
        view === "flow" ? (
          <FlowBody node={node} slot={layout.slot} status={status} badge={live?.badge} on={on || (pinout.controller && !!report?.powered)} left={layout.left} right={layout.right} live={pinLive} />
        ) : (
          <div className="pointer-events-none absolute overflow-hidden rounded-[10px]" style={{ left: layout.slot.x, top: layout.slot.y, width: layout.slot.w, height: layout.slot.h }}>
            {view === "reality" ? (
              <PartModel3D model={shown!} powered={!!lit} lit={litIds} still={{ spin: -24, tilt: 50 }} className="!h-full !w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1.5" style={{ backgroundImage: "linear-gradient(var(--canvas-grid) 1px, transparent 1px), linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px)", backgroundSize: "10px 10px" }}>
                <PartPlanGraphic model={shown!} powered={!!lit} lit={litIds} rotate={pinout.controller} className="h-full w-full drop-shadow-[0_3px_6px_rgba(15,23,42,0.18)]" />
              </div>
            )}
            {(node.partId === "led" || node.partId === "rgb-led") && on ? (
              <span
                className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
                style={{ background: live?.rgb ? `rgb(${live.rgb.map((c) => Math.round(c * 255)).join(",")})` : "#ff3b30", opacity: 0.55 * (live?.level ?? 1) }}
                aria-hidden
              />
            ) : null}
            {live?.text?.length && !screen ? (
              <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/80 px-2 py-1 font-mono text-[10px] leading-4 text-[#9df59b] shadow" data-testid="screen-overlay">{live.text.map((t) => <span key={t} className="block truncate">{t}</span>)}</span>
            ) : null}
          </div>
        )
      ) : null}

      {/* Pin rails */}
      {layout.left.map((pin, i) => (
        <PinRow key={pin.id} pin={pin} index={i} side="left" nodeId={id} connected={connections.get(pin.id) ?? null} faulty={faultyPins.has(pin.id)} live={pinLive(pin.id)} w={layout.w} partLabel={node.label} />
      ))}
      {layout.right.map((pin, i) => (
        <PinRow key={pin.id} pin={pin} index={i} side="right" nodeId={id} connected={connections.get(pin.id) ?? null} faulty={faultyPins.has(pin.id)} live={pinLive(pin.id)} w={layout.w} partLabel={node.label} />
      ))}
    </div>
  );
}

/** The name, status and badge floating above a part drawn as itself. */
function BareCaption({ node, status, lit, errors, warnings, badge, on = false }: { node: LabNode; status: PartStatus; lit: boolean; errors: number; warnings: number; badge?: string; on?: boolean }) {
  return (
    <div className="absolute left-0 top-0 flex h-[30px] max-w-full items-center gap-2 px-1" data-testid="board-caption">
      <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[status], status === "ready" && lit && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_25%,transparent)]")} title={STATUS_TEXT[status]} />
      <p className="truncate text-[13px] font-semibold leading-4">{node.label}</p>
      <p className="truncate text-[10.5px] leading-4 text-muted">
        {STATUS_TEXT[status]}
        {node.mode !== "virtual" ? ` · ${node.mode}` : ""}
      </p>
      {errors || warnings ? (
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", errors ? "bg-danger/12 text-danger" : "bg-warning/15 text-warning")} title={`${errors} errors, ${warnings} warnings`}>
          <AlertTriangle className="size-3" aria-hidden />
          {errors + warnings}
        </span>
      ) : null}
      {badge ? (
        <span className={cn("max-w-[7.5rem] shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums transition-colors", on ? "bg-success/12 text-success" : "bg-muted-bg text-muted")} data-testid="node-badge">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A board drawn as itself: the 3D or 2D model with no card around it. Each
 * header hole carries a handle, so jumper wires land on the real pin, and the
 * USB lead plugs into the real jack. A small caption above carries the name,
 * status and badge the card's header used to.
 */
function BareBoard({
  id,
  node,
  part,
  geometry,
  status,
  badge,
  errors,
  warnings,
  selected,
  flashed,
  view,
  lit,
  litIds,
  power,
  connections,
  faultyPins,
  pinLive,
}: {
  id: string;
  node: LabNode;
  part: NonNullable<ReturnType<typeof getPart>>;
  geometry: BoardGeometry;
  status: PartStatus;
  badge?: string;
  errors: number;
  warnings: number;
  selected?: boolean;
  flashed: boolean;
  view: string;
  lit: boolean;
  litIds?: string[];
  power: PowerState;
  connections: Map<string, string>;
  faultyPins: Set<string>;
  pinLive: (pin: string) => boolean;
}) {
  const pinout = getPinout(node.partId);
  const on = status === "ready" || lit;
  const connector = connectorFor(node.partId);
  return (
    <div
      className={cn("group relative", flashed && "rounded-[14px] ring-4 ring-warning/60")}
      style={{ width: geometry.w, height: geometry.h }}
      data-testid="lab-node"
      data-part={node.partId}
      data-status={status}
      data-bare="true"
    >
      {/* Caption: what the card's header said, floating above the board. */}
      <BareCaption node={node} status={status} lit={lit} errors={errors} warnings={warnings} badge={badge} on={on} />

      {/* The board. A selection shows as a glow round its outline, not a box. */}
      <div
        className={cn("pointer-events-none absolute transition-[filter] duration-200", selected && "[filter:drop-shadow(0_0_2px_var(--primary))_drop-shadow(0_0_10px_color-mix(in_srgb,var(--primary)_55%,transparent))]", !selected && status === "fault" && "[filter:drop-shadow(0_0_2px_var(--danger))_drop-shadow(0_0_8px_color-mix(in_srgb,var(--danger)_45%,transparent))]")}
        style={{ left: geometry.graphic.left, top: geometry.graphic.top, width: geometry.graphic.width, height: geometry.graphic.height }}
      >
        {view === "reality" ? (
          <PartModel3D model={part} powered={lit} lit={litIds} still={{ spin: -24, tilt: 50 }} scale={geometry.scale} flat className="!h-full !w-full" />
        ) : (
          <PartPlanGraphic model={part} powered={lit} lit={litIds} className="h-full w-full drop-shadow-[0_4px_10px_rgba(15,23,42,0.22)]" />
        )}
      </div>

      {/* The USB lead, into the real jack. */}
      {pinout.controller && geometry.usb ? <UsbCable connector={connector} state={power} anchor={geometry.usb} socket={false} /> : null}
      {pinout.controller && geometry.usb && power === "on" ? (
        <span className="pointer-events-none absolute whitespace-nowrap rounded-full border border-border bg-surface px-1.5 py-px font-mono text-[10px] font-semibold text-primary" style={{ left: geometry.usb.x - 8, top: geometry.usb.y + 18 }} data-testid="usb-tag">
          {CONNECTOR_NAME[connector]} · 5 V
        </span>
      ) : null}

      {/* Pins: a handle on every header hole. Labels show on hover or when selected. */}
      {pinout.pins.map((pin) => {
        const spot = geometry.pins[pin.id];
        if (!spot) return null;
        const tone = pinTone(pin);
        const color = TONE_VAR[tone];
        const connected = connections.get(pin.id) ?? null;
        const faulty = faultyPins.has(pin.id);
        const live = pinLive(pin.id);
        const title = [`${node.label} ${pin.label}`, pin.note, connected ? `Wired to ${connected}` : "Not wired: drag from here to another pin"].filter(Boolean).join("\n");
        const above = spot.position === Position.Top;
        return (
          <Handle
            key={pin.id}
            id={pin.id}
            type="source"
            position={spot.position}
            title={title}
            aria-label={`${pin.label} pin`}
            data-pin={pin.id}
            data-node={id}
            className={cn("!size-[9px] !rounded-full !border-2 !transition-transform hover:!scale-150", faulty && "hhip-fault-pulse")}
            style={{
              top: spot.y,
              left: spot.x,
              transform: "translate(-50%, -50%)",
              background: connected ? color : "color-mix(in srgb, var(--surface) 70%, transparent)",
              borderColor: faulty ? "var(--lab-fault)" : color,
              boxShadow: live ? `0 0 0 3px color-mix(in srgb, ${color} 35%, transparent)` : connected ? undefined : "0 0 0 1px rgba(0,0,0,0.25)",
              ["--pin-label" as string]: `"${pin.label.replace(/"/g, "")}"`,
              ["--pin-label-y" as string]: above ? "-16px" : "16px",
            }}
          />
        );
      })}
    </div>
  );
}

export const PartNode = memo(PartNodeView);
