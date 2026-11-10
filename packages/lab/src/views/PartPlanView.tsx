"use client";

import { useId, useMemo, useSyncExternalStore } from "react";
import { flatColor, shade } from "@kiungo/core/parts/build";
import type { Feature, PartModel, Solid } from "@kiungo/core/parts/types";
import { cn } from "@kiungo/ui/cn";
import { planImage } from "../render3d/renderer";

/**
 * The part as the WebGL renderer draws it from above (or the front), for the
 * rectangle an SVG shows, in the same millimeters. Null until it's drawn, and
 * without WebGL: then the SVG draws the part from its shapes instead.
 */
const noSubscribe = () => () => undefined;
/** True in the browser, false while rendering on the server (and during hydration). */
export function useInBrowser(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

function usePlanImage(model: PartModel, face: "top" | "front", region: { x: number; y: number; w: number; h: number }, powered: boolean, lit: readonly string[]): string | null {
  const browser = useInBrowser();
  const key = `${region.x}|${region.y}|${region.w}|${region.h}|${powered}|${lit.join(",")}`;
  return useMemo(() => {
    if (!browser) return null;
    try {
      return planImage(model, face, region, { powered, lit });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- region, powered and lit are in `key`
  }, [browser, model, face, key]);
}

/** Margin around the part, in mm, so small parts are not lost in white space. */
function padFor(w: number, h: number): number {
  return Math.max(2.5, Math.min(9, Math.max(w, h) * 0.14));
}

const KIND_LABEL: Record<Feature["kind"], string> = {
  pin: "Pin",
  pins: "Pins",
  port: "Port",
  led: "LED",
  button: "Button",
  chip: "Chip",
  antenna: "Antenna",
  sensor: "Sensing element",
  connector: "Connector",
  power: "Power",
  mechanical: "Mechanical",
  other: "Feature",
};

function zOf(solid: Solid, surface: number): number {
  if (solid.kind === "box" || solid.kind === "cyl" || solid.kind === "dome") return (solid.z ?? 0) + solid.d;
  if (solid.kind === "pins") return (solid.z ?? 0) + Math.max(0, solid.len);
  // Flat markings sit on the board surface unless placed elsewhere.
  return (solid.z ?? surface) + 0.05;
}

function surfaceOf(model: PartModel): number {
  const board = model.solids.find((solid) => solid.kind === "box" && solid.id === "pcb");
  return board && board.kind === "box" ? (board.z ?? 0) + board.d : 0;
}

function SolidShape({ solid, powered, lit, index, uid = "plan" }: { solid: Solid; powered: boolean; lit: Set<string>; index: number; uid?: string }) {
  const glowing = powered && (("id" in solid && solid.id && lit.has(solid.id)) || false);
  switch (solid.kind) {
    case "box": {
      const fill = solid.fill ?? flatColor(solid.top);
      const stroke = shade(fill, 0.7);
      const holes = solid.holes;
      const horizontal = solid.w >= solid.h;
      const label = solid.label;
      return (
        <g key={index}>
          <rect x={solid.x} y={solid.y} width={solid.w} height={solid.h} rx={solid.radius ?? 0.3} fill={fill} stroke={stroke} strokeWidth={0.15} />
          {glowing ? <rect x={solid.x} y={solid.y} width={solid.w} height={solid.h} rx={solid.radius ?? 0.3} fill={solid.glow} className="hhip-plan-glow" /> : null}
          {holes
            ? Array.from({ length: holes.count * (holes.rows ?? 1) }, (_, i) => {
                const rows = holes.rows ?? 1;
                const along = i % holes.count;
                const across = Math.floor(i / holes.count);
                const pitchAlong = (horizontal ? solid.w : solid.h) / holes.count;
                const pitchAcross = (horizontal ? solid.h : solid.w) / rows;
                const cx = horizontal ? solid.x + (along + 0.5) * pitchAlong : solid.x + (across + 0.5) * pitchAcross;
                const cy = horizontal ? solid.y + (across + 0.5) * pitchAcross : solid.y + (along + 0.5) * pitchAlong;
                return <rect key={i} x={cx - 0.45} y={cy - 0.45} width={0.9} height={0.9} fill="#3b3d42" stroke="#000" strokeWidth={0.1} />;
              })
            : null}
          {label ? (
            <text
              x={solid.x + solid.w / 2}
              y={solid.y + solid.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={label.size ?? 1.5}
              fill={label.color ?? "#a3a7ad"}
              fontFamily="var(--font-jetbrains), monospace"
            >
              {label.text.split("\n")[0]}
            </text>
          ) : null}
        </g>
      );
    }
    case "cyl": {
      const fill = solid.fill ?? flatColor(solid.top);
      return (
        <g key={index}>
          <circle cx={solid.cx} cy={solid.cy} r={solid.r} fill={fill} stroke={shade(fill, 0.7)} strokeWidth={0.15} />
          {glowing ? <circle cx={solid.cx} cy={solid.cy} r={solid.r} fill={solid.glow} className="hhip-plan-glow" /> : null}
        </g>
      );
    }
    case "dome": {
      const id = `${uid}-dome-${index}`;
      return (
        <g key={index}>
          <defs>
            <radialGradient id={id} cx="0.38" cy="0.35" r="0.7">
              <stop offset="0" stopColor={shade(solid.color, 1.35)} />
              <stop offset="0.6" stopColor={solid.color} />
              <stop offset="1" stopColor={shade(solid.color, 0.7)} />
            </radialGradient>
          </defs>
          <circle cx={solid.cx} cy={solid.cy} r={solid.r} fill={`url(#${id})`} opacity={solid.clear ? 0.75 : 1} />
          {glowing ? <circle cx={solid.cx} cy={solid.cy} r={solid.r * 1.25} fill={solid.glow ?? solid.color} className="hhip-plan-glow" /> : null}
        </g>
      );
    }
    case "pins": {
      const rows = solid.rows ?? 1;
      const size = solid.size ?? 0.64;
      const items: Array<{ x: number; y: number }> = [];
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < solid.count; i++) {
          const along = (i + 0.5) * solid.pitch;
          const across = (r + 0.5) * solid.pitch;
          items.push(solid.dir === "x" ? { x: solid.x + along, y: solid.y + across } : { x: solid.x + across, y: solid.y + along });
        }
      }
      return (
        <g key={index} fill={solid.color ?? "#b8bcc2"} stroke="#6b7280" strokeWidth={0.08}>
          {items.map((pin, i) => (
            <rect key={i} x={pin.x - size / 2} y={pin.y - size / 2} width={size} height={size} />
          ))}
        </g>
      );
    }
    case "text":
      return (
        <text
          key={index}
          x={solid.x}
          y={solid.y}
          fontSize={solid.size}
          fontWeight={solid.weight ?? 500}
          fill={solid.color ?? "#e9f1ec"}
          textAnchor={solid.anchor ?? "start"}
          fontFamily="var(--font-jetbrains), monospace"
          transform={solid.rotate ? `rotate(${solid.rotate} ${solid.x} ${solid.y})` : undefined}
        >
          {solid.text}
        </text>
      );
    case "path":
      return <path key={index} d={solid.d} fill={solid.fill ?? "none"} stroke={solid.color ?? "#2f8f73"} strokeWidth={solid.width ?? 0.3} strokeLinecap="round" strokeLinejoin="round" />;
    case "disc":
      return (
        <g key={index}>
          {solid.ring ? <circle cx={solid.cx} cy={solid.cy} r={solid.r + solid.ring.width} fill={solid.ring.color} /> : null}
          <circle cx={solid.cx} cy={solid.cy} r={solid.r} fill={solid.color} />
        </g>
      );
    default:
      return null;
  }
}

/** Shapes as seen from the front: x across, height up the page. */
function FrontShape({ solid, size, powered, lit, index }: { solid: Solid; size: PartModel["size"]; powered: boolean; lit: Set<string>; index: number }) {
  const top = (z: number, d: number) => size.d - (z + d);
  const glowing = powered && (("id" in solid && solid.id && lit.has(solid.id)) || false);
  switch (solid.kind) {
    case "box": {
      const fill = solid.fill ?? flatColor(solid.top);
      return (
        <g key={index}>
          <rect x={solid.x} y={top(solid.z ?? 0, solid.d)} width={solid.w} height={solid.d} rx={Math.min(solid.radius ?? 0.3, solid.d / 2)} fill={fill} stroke={shade(fill, 0.7)} strokeWidth={0.12} />
          {glowing ? <rect x={solid.x} y={top(solid.z ?? 0, solid.d)} width={solid.w} height={solid.d} fill={solid.glow} className="hhip-plan-glow" /> : null}
        </g>
      );
    }
    case "cyl": {
      const fill = solid.fill ?? flatColor(solid.top);
      return (
        <g key={index}>
          <rect x={solid.cx - solid.r} y={top(solid.z ?? 0, solid.d)} width={solid.r * 2} height={solid.d} fill={fill} stroke={shade(fill, 0.7)} strokeWidth={0.12} />
          {glowing ? <rect x={solid.cx - solid.r} y={top(solid.z ?? 0, solid.d)} width={solid.r * 2} height={solid.d} fill={solid.glow} className="hhip-plan-glow" /> : null}
        </g>
      );
    }
    case "dome": {
      const y = top(solid.z ?? 0, solid.d);
      const d = `M ${solid.cx - solid.r} ${y + solid.d} A ${solid.r} ${solid.d} 0 0 1 ${solid.cx + solid.r} ${y + solid.d} Z`;
      return (
        <g key={index}>
          <path d={d} fill={solid.color} opacity={solid.clear ? 0.75 : 1} stroke={shade(solid.color, 0.7)} strokeWidth={0.12} />
          {glowing ? <path d={d} fill={solid.glow ?? solid.color} className="hhip-plan-glow" /> : null}
        </g>
      );
    }
    case "pins": {
      const size_ = solid.size ?? 0.64;
      const z = solid.z ?? 0;
      const yTop = solid.len >= 0 ? top(z, solid.len) : top(z + solid.len, -solid.len);
      const items: number[] = [];
      for (let i = 0; i < solid.count; i++) {
        items.push(solid.dir === "x" ? solid.x + (i + 0.5) * solid.pitch : solid.x + (solid.rows ?? 1) * solid.pitch * 0.5);
      }
      return (
        <g key={index} fill={solid.color ?? "#b8bcc2"} stroke="#6b7280" strokeWidth={0.08}>
          {items.map((x, i) => (
            <rect key={i} x={x - size_ / 2} y={yTop} width={size_} height={Math.abs(solid.len)} />
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

export function PartPlanView({ model, powered, activeFeature, onFeature, className }: { model: PartModel; powered: boolean; activeFeature: string | null; onFeature: (id: string | null) => void; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const front = model.plan === "front";
  const pinDrop = front ? Math.max(0, ...model.solids.map((s) => (s.kind === "pins" && s.len < 0 ? -(s.z ?? 0) - s.len : 0))) : 0;
  const w = model.size.w;
  const h = front ? model.size.d + pinDrop : model.size.h;
  const PAD = padFor(w, h);
  const font = Math.max(0.8, Math.min(1.8, Math.max(w, h) * 0.035));
  // Connectors and legs may overhang the footprint; keep them in the picture.
  const extent = (solid: Solid) => {
    if (solid.kind === "box") return { x1: solid.x, y1: solid.y, x2: solid.x + solid.w, y2: solid.y + solid.h };
    if (solid.kind === "cyl" || solid.kind === "dome") return { x1: solid.cx - solid.r, y1: solid.cy - solid.r, x2: solid.cx + solid.r, y2: solid.cy + solid.r };
    return null;
  };
  const extents = [...model.solids.map(extent).filter((e): e is NonNullable<typeof e> => e !== null), ...model.features.map((f) => ({ x1: f.x, y1: f.y, x2: f.x + f.w, y2: f.y + f.h }))];
  const minX = Math.min(0, ...extents.map((e) => e.x1));
  const maxX = Math.max(w, ...extents.map((e) => e.x2));
  const maxY = front ? h : Math.max(h, ...extents.map((e) => e.y2));
  const left = Math.min(-PAD, minX - PAD * 0.35);
  const viewW = Math.max(w + PAD, maxX + PAD * 0.35) - left;
  const viewH = Math.max(h + PAD, maxY + PAD * 0.35) + PAD;
  const dim = { line: PAD * 0.45, tick: PAD * 0.13, text: PAD * 0.6, side: PAD * 0.5, sideText: 0.4 + font * 0.75 };
  // Feature outlines and the label chip are sized for a ~60 mm board; shrink them for small parts.
  const k = Math.max(0.3, Math.min(1, Math.max(w, h) / 60));
  const lit = new Set(model.animate?.lit ?? []);
  const surface = surfaceOf(model);
  const sorted = front
    ? model.solids
        .map((solid, index) => ({ solid, index }))
        .sort((a, b) => ("y" in a.solid ? a.solid.y : "cy" in a.solid ? a.solid.cy : 0) - ("y" in b.solid ? b.solid.y : "cy" in b.solid ? b.solid.cy : 0) || a.index - b.index)
    : model.solids.map((solid, index) => ({ solid, index })).sort((a, b) => zOf(a.solid, surface) - zOf(b.solid, surface) || a.index - b.index);
  const active = model.features.find((feature) => feature.id === activeFeature) ?? null;
  const image = usePlanImage(model, front ? "front" : "top", { x: left, y: -PAD, w: viewW, h: viewH }, powered, [...lit]);

  return (
    <div className={cn("relative", className)} data-testid="part-plan">
      <svg viewBox={`${left} ${-PAD} ${viewW} ${viewH}`} className="h-full w-full" role="img" aria-label={`${front ? "Front" : "Top"} view of the ${model.name}, ${w} by ${h} millimeters`}>
        <defs>
          <pattern id={`${uid}-minor`} width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="var(--canvas-grid)" strokeWidth={0.06 * k} />
          </pattern>
          <pattern id={`${uid}-major`} width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill={`url(#${uid}-minor)`} />
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="color-mix(in srgb, var(--muted) 35%, transparent)" strokeWidth={0.1 * k} />
          </pattern>
        </defs>
        <rect x={left} y={-PAD} width={viewW} height={viewH} fill="var(--canvas)" />
        <rect x={left} y={-PAD} width={viewW} height={viewH} fill={`url(#${uid}-major)`} />

        {/* Dimensions */}
        <g stroke="var(--muted)" strokeWidth={font * 0.08} fill="var(--muted)" fontFamily="var(--font-jetbrains), monospace" fontSize={font}>
          <line x1={0} y1={-dim.line} x2={w} y2={-dim.line} />
          <line x1={0} y1={-dim.line - dim.tick} x2={0} y2={-dim.line + dim.tick} />
          <line x1={w} y1={-dim.line - dim.tick} x2={w} y2={-dim.line + dim.tick} />
          <text x={w / 2} y={-dim.text} textAnchor="middle" stroke="none">
            {Math.round(w * 10) / 10} mm
          </text>
          <line x1={left + dim.side} y1={0} x2={left + dim.side} y2={h} />
          <line x1={left + dim.side - dim.tick} y1={0} x2={left + dim.side + dim.tick} y2={0} />
          <line x1={left + dim.side - dim.tick} y1={h} x2={left + dim.side + dim.tick} y2={h} />
          <text x={left + dim.sideText} y={h / 2} textAnchor="middle" stroke="none" transform={`rotate(-90 ${left + dim.sideText} ${h / 2})`}>
            {Math.round(h * 10) / 10} mm
          </text>
        </g>

        {image ? (
          <image href={image} x={left} y={-PAD} width={viewW} height={viewH} preserveAspectRatio="none" data-testid="part-plan-render" />
        ) : (
          sorted.map(({ solid, index }) =>
            front ? <FrontShape key={index} solid={solid} size={model.size} powered={powered} lit={lit} index={index} /> : <SolidShape key={index} solid={solid} powered={powered} lit={lit} index={index} uid={uid} />,
          )
        )}

        {/* Features: hover or focus to see what each is. Big ones first, so small ones stay reachable on top. */}
        {[...model.features]
          .sort((a, b) => b.w * b.h - a.w * a.h)
          .map((feature) => {
            const isActive = feature.id === activeFeature;
            return (
              <g
                key={feature.id}
                role="button"
                tabIndex={0}
                aria-label={`${feature.label}: ${KIND_LABEL[feature.kind]}`}
                aria-pressed={isActive}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onFeature(feature.id)}
                onFocus={() => onFeature(feature.id)}
                onClick={() => onFeature(isActive ? null : feature.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFeature(isActive ? null : feature.id);
                  }
                }}
                data-feature={feature.id}
              >
                <rect
                  x={feature.x - 0.6 * k}
                  y={feature.y - 0.6 * k}
                  width={feature.w + 1.2 * k}
                  height={feature.h + 1.2 * k}
                  rx={0.8 * k}
                  fill={isActive ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "transparent"}
                  stroke={isActive ? "var(--primary)" : "color-mix(in srgb, var(--primary) 45%, transparent)"}
                  strokeWidth={(isActive ? 0.35 : 0.18) * k}
                  strokeDasharray={isActive ? undefined : `${0.6 * k} ${0.5 * k}`}
                />
              </g>
            );
          })}

        {active ? (
          <g pointerEvents="none">
            {(() => {
              const labelWidth = Math.max(10, active.label.length * 1.15 + 3) * k;
              const chipH = 4 * k;
              const above = active.y > 8 * k;
              const lx = Math.min(Math.max(left + k, active.x + active.w / 2 - labelWidth / 2), left + viewW - labelWidth - k);
              const ly = above ? active.y - 5.4 * k : active.y + active.h + 1.4 * k;
              return (
                <>
                  <line
                    x1={active.x + active.w / 2}
                    y1={above ? active.y - 0.6 * k : active.y + active.h + 0.6 * k}
                    x2={active.x + active.w / 2}
                    y2={above ? ly + chipH : ly}
                    stroke="var(--primary)"
                    strokeWidth={0.25 * k}
                  />
                  <rect x={lx} y={ly} width={labelWidth} height={chipH} rx={k} fill="var(--primary)" />
                  <text x={lx + labelWidth / 2} y={ly + 2.75 * k} textAnchor="middle" fontSize={2 * k} fontWeight={600} fill="var(--primary-foreground)" fontFamily="var(--font-inter), sans-serif">
                    {active.label}
                  </text>
                </>
              );
            })()}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/**
 * Just the part, drawn from above (or from the front for standing parts):
 * no grid, dimensions or feature outlines. For small renders such as lab
 * canvas nodes. `rotate` turns a landscape part upright to fit a tall slot.
 */
export function PartPlanGraphic({ model, powered, lit: litOverride, rotate = false, className }: { model: PartModel; powered: boolean; lit?: string[]; rotate?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const front = model.plan === "front";
  const pinDrop = front ? Math.max(0, ...model.solids.map((s) => (s.kind === "pins" && s.len < 0 ? -(s.z ?? 0) - s.len : 0))) : 0;
  const w = model.size.w;
  const h = front ? model.size.d + pinDrop : model.size.h;
  const extent = (solid: Solid) => {
    if (solid.kind === "box") return { x1: solid.x, y1: solid.y, x2: solid.x + solid.w, y2: solid.y + solid.h };
    if (solid.kind === "cyl" || solid.kind === "dome") return { x1: solid.cx - solid.r, y1: solid.cy - solid.r, x2: solid.cx + solid.r, y2: solid.cy + solid.r };
    return null;
  };
  const extents = front ? [] : model.solids.map(extent).filter((e): e is NonNullable<typeof e> => e !== null);
  const minX = Math.min(0, ...extents.map((e) => e.x1));
  const minY = Math.min(0, ...extents.map((e) => e.y1));
  const maxX = Math.max(w, ...extents.map((e) => e.x2));
  const maxY = front ? h : Math.max(h, ...extents.map((e) => e.y2));
  const pad = Math.max(w, h) * 0.04;
  const vx = minX - pad;
  const vy = minY - pad;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;
  const lit = new Set(litOverride ?? model.animate?.lit ?? []);
  const surface = surfaceOf(model);
  const sorted = front
    ? model.solids.map((solid, index) => ({ solid, index }))
    : model.solids.map((solid, index) => ({ solid, index })).sort((a, b) => zOf(a.solid, surface) - zOf(b.solid, surface) || a.index - b.index);
  const turned = rotate && vw > vh * 1.15;
  const box = turned ? `${vy} ${-(vx + vw)} ${vh} ${vw}` : `${vx} ${vy} ${vw} ${vh}`;
  const image = usePlanImage(model, front ? "front" : "top", { x: vx, y: vy, w: vw, h: vh }, powered, [...lit]);
  return (
    <svg viewBox={box} className={className} role="img" aria-label={`${model.name}, ${front ? "front" : "top"} view`} preserveAspectRatio="xMidYMid meet">
      <g transform={turned ? "rotate(-90)" : undefined}>
        {image ? (
          <image href={image} x={vx} y={vy} width={vw} height={vh} preserveAspectRatio="none" data-testid="part-plan-render" />
        ) : (
          sorted.map(({ solid, index }) =>
            front ? <FrontShape key={index} solid={solid} size={model.size} powered={powered} lit={lit} index={index} /> : <SolidShape key={index} solid={solid} powered={powered} lit={lit} index={index} uid={uid} />,
          )
        )}
      </g>
    </svg>
  );
}

export { KIND_LABEL };
