"use client";

import { useMemo, type ReactNode } from "react";
import { Handle } from "@xyflow/react";
import { PartModel3D } from "./views/PartModel3D";
import { PartPlanGraphic } from "./views/PartPlanView";
import type { BoardGeometry } from "@kiungo/core/lab/board-geometry";
import type { NetKind } from "@kiungo/core/lab/circuit";
import { getPinout } from "@kiungo/core/lab/pinout";
import type { LabNode, LabView } from "@kiungo/core/lab/types";
import type { PartModel } from "@kiungo/core/parts/types";
import { cn } from "@kiungo/ui/cn";
import { useLabContext } from "./lab-context";

/** The color a strip takes from what its net carries. */
const KIND_COLOR: Partial<Record<NetKind, string>> = {
  power: "var(--lab-power)",
  ground: "var(--lab-ground)",
  signal: "var(--lab-digital)",
  short: "var(--lab-fault)",
  conflict: "var(--lab-fault)",
};

interface StripState {
  holes: readonly string[];
  /** Set when the strip's net has a wire somewhere: the color of what it carries. */
  color: string | null;
  live: boolean;
}

/**
 * A breadboard on the lab canvas, drawn as itself in every view. Each of its
 * 400 holes takes a wire, and a strip lights in the color of its net (red
 * for a supply, slate for ground, blue for a signal) as soon as it is wired,
 * so it is plain which holes are joined. In Trace, the board is drawn as its
 * strips alone, with current running along the ones in use.
 */
export function BreadboardNode({
  id,
  node,
  part,
  geometry,
  view,
  status,
  selected,
  flashed,
  caption,
  connections,
  pinLive,
}: {
  id: string;
  node: LabNode;
  part: PartModel;
  geometry: BoardGeometry;
  view: LabView;
  status: string;
  selected?: boolean;
  flashed: boolean;
  caption: ReactNode;
  connections: Map<string, string>;
  pinLive: (pin: string) => boolean;
}) {
  const { analysis } = useLabContext();
  const pinout = getPinout(node.partId);

  const strips = useMemo<StripState[]>(() => {
    const nets = new Map(analysis.nets.map((n) => [n.id, n]));
    return (pinout.strips ?? []).map((holes) => {
      const net = nets.get(analysis.netOfPin.get(`${id}:${holes[0]}`) ?? "");
      const color = net && net.wires.length ? (KIND_COLOR[net.kind] ?? "var(--lab-digital)") : null;
      return { holes, color, live: !!color && pinLive(holes[0]) };
    });
  }, [analysis, id, pinLive, pinout.strips]);

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of strips) if (s.color) for (const h of s.holes) map.set(h, s.color);
    return map;
  }, [strips]);

  const trace = view === "flow";
  const g = geometry.graphic;
  const ends = (holes: readonly string[]) => {
    const a = geometry.pins[holes[0]];
    const b = geometry.pins[holes[holes.length - 1]];
    return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
  };

  return (
    <div
      className={cn("group relative", flashed && "rounded-[14px] ring-4 ring-warning/60")}
      style={{ width: geometry.w, height: geometry.h }}
      data-testid="lab-node"
      data-part={node.partId}
      data-status={status}
      data-bare="true"
      data-breadboard="true"
    >
      {caption}

      <div
        className={cn(
          "pointer-events-none absolute transition-[filter] duration-200",
          selected && "[filter:drop-shadow(0_0_2px_var(--primary))_drop-shadow(0_0_10px_color-mix(in_srgb,var(--primary)_55%,transparent))]",
        )}
        style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
      >
        {view === "reality" ? (
          <PartModel3D model={part} powered={false} still={geometry.view} scale={geometry.scale} flat className="!h-full !w-full" />
        ) : view === "top" ? (
          <PartPlanGraphic model={part} powered={false} className="h-full w-full drop-shadow-[0_4px_10px_rgba(15,23,42,0.18)]" />
        ) : null}
      </div>

      {/* Strips: lit in the color of their net. In Trace, the strips are the drawing. */}
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={geometry.w} height={geometry.h} aria-hidden data-testid="breadboard-strips">
        {trace ? (
          <>
            <rect
              x={g.left + g.width * 0.02}
              y={g.top + g.height * 0.02}
              width={g.width * 0.96}
              height={g.height * 0.96}
              rx={10}
              fill="var(--surface)"
              stroke={selected ? "var(--primary)" : "var(--border)"}
              strokeWidth={selected ? 1.6 : 1}
            />
            {(() => {
              const e = geometry.pins.e1;
              const f = geometry.pins.f1;
              if (!e || !f) return null;
              const y = (e.y + f.y) / 2;
              return <line x1={g.left + g.width * 0.04} x2={g.left + g.width * 0.96} y1={y} y2={y} stroke="var(--border)" strokeWidth={6} strokeLinecap="round" />;
            })()}
          </>
        ) : null}
        {strips.map((s) => {
          const e = ends(s.holes);
          if (!e) return null;
          if (!trace && !s.color) return null;
          const color = s.color ?? "var(--lab-muted)";
          return (
            <g key={s.holes[0]} data-strip={s.holes[0]} data-lit={s.color ? "true" : undefined}>
              <line {...e} stroke={color} strokeWidth={trace ? 3 : 8} strokeOpacity={trace ? (s.color ? 0.9 : 0.55) : 0.28} strokeLinecap="round" />
              {s.live ? <line {...e} stroke={color} strokeWidth={2} strokeDasharray="4 8" className="hhip-live-dash" /> : null}
            </g>
          );
        })}
        {trace
          ? pinout.pins.map((pin) => {
              const spot = geometry.pins[pin.id];
              if (!spot) return null;
              return <circle key={pin.id} cx={spot.x} cy={spot.y} r={1.6} fill={colorOf.get(pin.id) ?? "var(--lab-muted)"} />;
            })
          : null}
      </svg>

      {/* A handle on every hole. Empty holes are the drawing's own; a wired hole fills with its net's color. */}
      {pinout.pins.map((pin) => {
        const spot = geometry.pins[pin.id];
        if (!spot) return null;
        const connected = connections.get(pin.id) ?? null;
        const color = colorOf.get(pin.id) ?? "var(--lab-muted)";
        const title = [`${node.label} ${pin.label}`, pin.note, connected ? `Wired to ${connected}` : "Drag a wire here"].filter(Boolean).join("\n");
        return (
          <Handle
            key={pin.id}
            id={pin.id}
            type="source"
            position={spot.position}
            title={title}
            aria-label={`${pin.label} hole`}
            data-pin={pin.id}
            data-node={id}
            data-wired={connected ? "true" : undefined}
            className="hhip-bb-hole"
            style={{
              top: spot.y,
              left: spot.x,
              transform: "translate(-50%, -50%)",
              background: connected ? color : undefined,
              borderColor: connected ? color : undefined,
              ["--pin-label" as string]: `"${pin.label}"`,
              ["--pin-label-y" as string]: spot.y < geometry.h / 2 ? "-13px" : "13px",
            }}
          />
        );
      })}
    </div>
  );
}
