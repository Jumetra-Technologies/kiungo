"use client";

import { useState } from "react";
import type { BlockKind, CircuitLink, LinkKind, PartModel } from "@kiungo/core/parts/types";
import { cn } from "@kiungo/ui/cn";

const COL = 182;
const ROW = 86;
const BW = 132;
const BH = 50;
const MARGIN = 26;

const BLOCK_TONE: Record<BlockKind, string> = {
  pin: "var(--muted)",
  power: "var(--warning)",
  ground: "var(--muted)",
  mcu: "var(--primary)",
  ic: "var(--primary)",
  passive: "var(--muted)",
  sensor: "var(--success)",
  actuator: "var(--warning)",
  connector: "var(--muted)",
  antenna: "#8b5cf6",
  regulator: "var(--warning)",
  driver: "var(--primary)",
  display: "var(--success)",
  world: "var(--success)",
};

const LINK_TONE: Record<LinkKind, string> = {
  power: "var(--warning)",
  ground: "var(--muted)",
  signal: "var(--primary)",
  data: "#8b5cf6",
  analog: "var(--success)",
  mechanical: "var(--muted)",
  rf: "#8b5cf6",
  light: "var(--warning)",
  sound: "var(--success)",
  physical: "var(--success)",
};

export const LINK_LABEL: Record<LinkKind, string> = {
  power: "Power",
  ground: "Ground",
  signal: "Digital signal",
  data: "Data",
  analog: "Analog signal",
  mechanical: "Motion",
  rf: "Radio",
  light: "Light",
  sound: "Sound",
  physical: "Heat, pressure, gas",
};

function blockRect(col: number, row: number) {
  return { x: MARGIN + col * COL, y: MARGIN + row * ROW, w: BW, h: BH };
}

/** The path between two blocks and where its label chip goes (chip center). */
function linkPath(link: CircuitLink, blocks: PartModel["circuit"]["blocks"]): { d: string; label: { x: number; y: number } } | null {
  const from = blocks.find((block) => block.id === link.from);
  const to = blocks.find((block) => block.id === link.to);
  if (!from || !to) return null;
  const a = blockRect(from.col, from.row);
  const b = blockRect(to.col, to.row);
  if (a.x === b.x) {
    // Straight down or up: the chip rides on the line.
    const down = b.y > a.y;
    const y1 = down ? a.y + a.h : a.y;
    const y2 = down ? b.y : b.y + b.h;
    const x = a.x + a.w / 2;
    return { d: `M ${x} ${y1} L ${x} ${y2}`, label: { x, y: (y1 + y2) / 2 } };
  }
  const forward = b.x > a.x;
  const x1 = forward ? a.x + a.w : a.x;
  const x2 = forward ? b.x : b.x + b.w;
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  if (a.y === b.y) {
    // Side by side: the gap is narrow, so the chip sits just above the row.
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, label: { x: (x1 + x2) / 2, y: a.y - 11 } };
  }
  const c = (x2 - x1) / 2;
  return { d: `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`, label: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 10 } };
}

/**
 * How a part works inside, as blocks and the current between them.
 *
 * The full layout (Component library) has the diagram, a hover note and the
 * numbered steps. `compact` is for small fixed-height boxes like the lab's
 * Inspector: the diagram fills the box and the hover note is one line laid
 * over its foot; the steps are left to the host to show elsewhere. (Without
 * it, the note and steps were squeezed into the box and drawn over each other.)
 */
export function PartFlowView({ model, powered, className, compact = false }: { model: PartModel; powered: boolean; className?: string; compact?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const { blocks, links, steps } = model.circuit;
  const cols = Math.max(...blocks.map((block) => block.col)) + 1;
  const rows = Math.max(...blocks.map((block) => block.row)) + 1;
  const width = MARGIN * 2 + (cols - 1) * COL + BW;
  const height = MARGIN * 2 + (rows - 1) * ROW + BH;
  const hovered = blocks.find((block) => block.id === hover) ?? null;
  const touches = (link: CircuitLink) => hover === null || link.from === hover || link.to === hover;

  return (
    <div className={cn("flex h-full flex-col", compact && "relative", className)} data-testid="part-flow" data-compact={compact || undefined}>
      <div className={cn("min-h-0 flex-1 rounded-[12px] bg-canvas", compact ? "overflow-hidden p-1.5 pb-8" : "overflow-auto")}>
        <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto h-full w-full" style={{ maxWidth: width * 1.4 }} role="img" aria-label={`How the ${model.name} works inside: ${blocks.length} blocks and ${links.length} connections`}>
          <defs>
            {(Object.keys(LINK_TONE) as LinkKind[]).map((kind) => (
              <marker key={kind} id={`flow-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_TONE[kind]} />
              </marker>
            ))}
          </defs>

          {links.map((link, i) => {
            const path = linkPath(link, blocks);
            if (!path) return null;
            const tone = LINK_TONE[link.kind];
            const active = touches(link);
            return (
              <g key={i} opacity={active ? 1 : 0.22} className="transition-opacity">
                <path d={path.d} fill="none" stroke={tone} strokeWidth={2.2} strokeLinecap="round" markerEnd={`url(#flow-arrow-${link.kind})`} markerStart={link.both ? `url(#flow-arrow-${link.kind})` : undefined} opacity={0.55} />
                {powered ? <path d={path.d} fill="none" stroke={tone} strokeWidth={2.2} strokeLinecap="round" strokeDasharray="5 9" className="hhip-flow-dash" /> : null}
                {link.label ? (
                  <g>
                    <rect x={path.label.x - link.label.length * 3.2 - 5} y={path.label.y - 7} width={link.label.length * 6.4 + 10} height={14} rx={4} fill="var(--surface)" stroke={tone} strokeWidth={0.8} />
                    <text x={path.label.x} y={path.label.y + 3.5} textAnchor="middle" fontSize="10" fill="var(--foreground)" fontFamily="var(--font-jetbrains), monospace">
                      {link.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {blocks.map((block) => {
            const r = blockRect(block.col, block.row);
            const tone = BLOCK_TONE[block.kind];
            const isHover = hover === block.id;
            return (
              <g
                key={block.id}
                role="button"
                tabIndex={0}
                aria-label={`${block.label}${block.sub ? `, ${block.sub}` : ""}`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setHover(block.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(block.id)}
                onBlur={() => setHover(null)}
                data-block={block.id}
              >
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={10} fill="var(--surface)" stroke={isHover ? "var(--primary)" : "var(--border)"} strokeWidth={isHover ? 2 : 1.2} />
                <rect x={r.x} y={r.y + 8} width={4} height={r.h - 16} rx={2} fill={tone} />
                <text x={r.x + 14} y={r.y + (block.sub ? 22 : 29)} fontSize="13" fontWeight={600} fill="var(--foreground)" fontFamily="var(--font-inter), sans-serif">
                  {block.label}
                </text>
                {block.sub ? (
                  <text x={r.x + 14} y={r.y + 38} fontSize="10.5" fill="var(--muted)" fontFamily="var(--font-jetbrains), monospace">
                    {block.sub}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {compact ? (
        <p className="absolute inset-x-0 bottom-0 truncate rounded-b-[12px] border-t border-border bg-surface/95 px-3 py-1.5 text-[11.5px] leading-4 backdrop-blur" aria-live="polite" title={hovered ? `${hovered.label}. ${hovered.note}` : undefined} data-testid="part-flow-note">
          {hovered ? (
            <>
              <span className="font-semibold">{hovered.label}.</span> <span className="text-muted">{hovered.note}</span>
            </>
          ) : (
            <span className="text-muted">{powered ? "Current flows along the highlighted paths. Hover a block." : "Hover a block to see what it does."}</span>
          )}
        </p>
      ) : (
        <div className="mt-3 min-h-[3.25rem] shrink-0 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm leading-6" aria-live="polite">
          {hovered ? (
            <>
              <span className="font-semibold">{hovered.label}.</span> <span className="text-muted">{hovered.note}</span>
            </>
          ) : (
            <span className="text-muted">Hover a block to see what it does. {powered ? "Current is flowing along the highlighted paths." : "Switch the power on to see current flow."}</span>
          )}
        </div>
      )}

      {compact ? null : (
        <ol className="mt-4 shrink-0 space-y-2 text-sm leading-6" aria-label="How it works">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-bg font-mono text-xs font-semibold text-foreground">
                {i + 1}
              </span>
              <span className="text-muted">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
