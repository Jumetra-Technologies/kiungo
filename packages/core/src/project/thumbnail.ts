/**
 * A small drawing of a circuit for Home (DSK-10): each part as a box where it
 * sits on the canvas, each wire as a line between the parts it joins. It is
 * data, not markup, so the interface draws it in the current theme's colors.
 */

import { nodeFootprint } from "../lab/layout";
import { getPart } from "../parts";
import type { LabNode, LabWire } from "../lab/types";

export type ThumbnailKind = "board" | "breadboard" | "sensor" | "output" | "display" | "radio" | "other";

export interface CircuitThumbnail {
  /** viewBox width and height; boxes and lines are in these units. */
  width: number;
  height: number;
  boxes: Array<{ x: number; y: number; w: number; h: number; kind: ThumbnailKind }>;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

const PAD = 24;
const MAX_LINES = 400;

function kindOf(partId: string): ThumbnailKind {
  const group = getPart(partId)?.group;
  if (group === "boards") return "board";
  if (group === "prototyping") return partId.startsWith("breadboard") ? "breadboard" : "other";
  if (group === "sensors") return "sensor";
  if (group === "outputs") return "output";
  if (group === "displays") return "display";
  if (group === "radios") return "radio";
  return "other";
}

export function circuitThumbnail(nodes: readonly LabNode[], wires: readonly LabWire[]): CircuitThumbnail {
  if (!nodes.length) return { width: 160, height: 100, boxes: [], lines: [] };
  const sized = nodes.map((n) => {
    const { w, h } = nodeFootprint(n.partId);
    return { id: n.id, x: n.x, y: n.y, w, h, kind: kindOf(n.partId) };
  });
  const minX = Math.min(...sized.map((b) => b.x)) - PAD;
  const minY = Math.min(...sized.map((b) => b.y)) - PAD;
  const maxX = Math.max(...sized.map((b) => b.x + b.w)) + PAD;
  const maxY = Math.max(...sized.map((b) => b.y + b.h)) + PAD;
  const at = new Map(sized.map((b) => [b.id, b]));
  const centre = (id: string) => {
    const b = at.get(id);
    return b ? { x: b.x - minX + b.w / 2, y: b.y - minY + b.h / 2 } : null;
  };
  const lines: CircuitThumbnail["lines"] = [];
  const seen = new Set<string>();
  for (const w of wires) {
    if (lines.length >= MAX_LINES) break;
    if (w.from.node === w.to.node) continue;
    const key = [w.from.node, w.to.node].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const a = centre(w.from.node);
    const b = centre(w.to.node);
    if (a && b) lines.push({ x1: Math.round(a.x), y1: Math.round(a.y), x2: Math.round(b.x), y2: Math.round(b.y) });
  }
  return {
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    boxes: sized.map((b) => ({ x: Math.round(b.x - minX), y: Math.round(b.y - minY), w: b.w, h: b.h, kind: b.kind })),
    lines,
  };
}
