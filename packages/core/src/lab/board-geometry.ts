/**
 * A board drawn as itself on the lab canvas: no card, no pin rails. Wires
 * land on the real header holes, and the USB lead plugs into the real jack.
 *
 * In the 2D view the board lies flat; in 3D it is the library's still
 * three-quarter view, rendered without perspective so that every pin's
 * screen position is known (lib/parts/geometry.ts). Both views give the node
 * the same size, so switching views doesn't move anything else.
 */

import { Position } from "@xyflow/system";
import { getPart } from "../parts";
import { project, projectAngle, type View3D } from "../parts/geometry";
import type { CanvasSpec, PartModel } from "../parts/types";
import type { LabView } from "./types";

/** Pixels per millimeter on the canvas. An Uno comes out 302 px wide. */
export const BOARD_SCALE = 4.4;
/** The still 3D view used on the canvas. */
export const BOARD_VIEW = { spin: -24, tilt: 50 } as const;
/** Room above the board for the caption, and around it for handles. */
const CAPTION = 30;
const MARGIN = 14;
/** Where a header's hole top sits: the PCB plus the header's height. */
const HOLE_Z = 1.6 + 8.5;

export interface BoardPinSpot {
  /** Center of the handle, px from the node's top-left. */
  x: number;
  y: number;
  /** Which way a wire leaves the pin. */
  position: Position;
}

export interface BoardGeometry {
  w: number;
  h: number;
  scale: number;
  /** The graphic's box inside the node (px). */
  graphic: { left: number; top: number; width: number; height: number };
  pins: Record<string, BoardPinSpot>;
  /** The USB lead's socket: where the plug seats and the angle it comes in at (0 = from above, -90 = from the left). */
  usb: { x: number; y: number; angle: number } | null;
  /** Caption bar height, above the board. */
  caption: number;
  /** The still 3D view the part is drawn at. */
  view: View3D;
}

/** The mm box the part occupies, including anything overhanging the PCB (the USB jack). */
function footprint(model: PartModel) {
  let x1 = 0;
  let y1 = 0;
  let x2 = model.size.w;
  let y2 = model.size.h;
  for (const s of model.solids) {
    if (s.kind === "box") {
      x1 = Math.min(x1, s.x);
      y1 = Math.min(y1, s.y);
      x2 = Math.max(x2, s.x + s.w);
      y2 = Math.max(y2, s.y + s.h);
    } else if (s.kind === "cyl" || s.kind === "dome") {
      x1 = Math.min(x1, s.cx - s.r);
      y1 = Math.min(y1, s.cy - s.r);
      x2 = Math.max(x2, s.cx + s.r);
      y2 = Math.max(y2, s.cy + s.r);
    }
  }
  return { x1, y1, x2, y2 };
}

/** The same padding PartPlanGraphic adds round its viewBox. */
function planPad(model: PartModel) {
  return Math.max(model.size.w, model.size.h) * 0.04;
}

function sideOf(spec: CanvasSpec["pins"][string], model: PartModel): Position {
  const { w, h } = model.size;
  const dx = Math.min(spec.x, w - spec.x) / w;
  const dy = Math.min(spec.y, h - spec.y) / h;
  if (dy <= dx) return spec.y < h / 2 ? Position.Top : Position.Bottom;
  return spec.x < w / 2 ? Position.Left : Position.Right;
}

function usbAngle(from: NonNullable<CanvasSpec["usb"]>["from"]): number {
  return from === "left" ? -90 : from === "right" ? 90 : from === "bottom" ? 180 : 0;
}

/** Geometry of a bare board for one view, or null when the part isn't drawn bare. */
export function boardGeometry(partId: string, view: LabView): BoardGeometry | null {
  const model = getPart(partId);
  if (!model?.canvas || (view === "flow" && !model.canvas.trace)) return null;
  const s = BOARD_SCALE;
  const v3: View3D = model.canvas.view ?? BOARD_VIEW;
  const holeZ = model.canvas.pinZ ?? HOLE_Z;
  const fp = footprint(model);
  // The 3D bounding box decides the node's size in both views.
  const corners: Array<{ x: number; y: number }> = [];
  for (const x of [fp.x1, fp.x2]) for (const y of [fp.y1, fp.y2]) for (const z of [0, model.size.d]) corners.push(project(model, s, v3, { x, y, z }));
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const w = Math.ceil(maxX - minX + MARGIN * 2);
  const h = Math.ceil(maxY - minY + MARGIN * 2 + CAPTION);

  if (view === "reality") {
    // The scene is the node's full width below the caption. PartModel3D puts the stage's
    // center at the scene's center (plus the lift that project() already includes), so a
    // point lands at scene center + project(). Shift the scene so the board's box is centered.
    const sw = w;
    const sh = h - CAPTION;
    const graphic = { left: -(minX + maxX) / 2, top: CAPTION - (minY + maxY) / 2, width: sw, height: sh };
    const at = (p: { x: number; y: number; z: number }) => {
      const q = project(model, s, v3, p);
      return { x: graphic.left + sw / 2 + q.x, y: graphic.top + sh / 2 + q.y };
    };
    const pins: BoardGeometry["pins"] = {};
    for (const [id, spec] of Object.entries(model.canvas.pins)) pins[id] = { ...at({ ...spec, z: holeZ }), position: sideOf(spec, model) };
    const u = model.canvas.usb;
    const usb = u
      ? (() => {
          const dir = u.from === "left" ? { x: -1, y: 0 } : u.from === "right" ? { x: 1, y: 0 } : u.from === "top" ? { x: 0, y: -1 } : { x: 0, y: 1 };
          // The lead's own axis points into the socket, so its angle is the direction it comes from, turned 90°.
          return { ...at({ x: u.x, y: u.y, z: u.z }), angle: projectAngle(model, s, v3, dir) + 90 };
        })()
      : null;
    return { w, h, scale: s, graphic, pins, usb, caption: CAPTION, view: v3 };
  }

  // 2D (and Trace, for parts drawn bare there): the plan graphic, flat, centered in the same box.
  const pad = planPad(model);
  const vx = fp.x1 - pad;
  const vy = fp.y1 - pad;
  const vw = fp.x2 - fp.x1 + pad * 2;
  const vh = fp.y2 - fp.y1 + pad * 2;
  // A wide, gently tilted board (a breadboard) is taller and wider flat than in 3D:
  // shrink the plan to fit below the caption instead of running over it.
  const fit = Math.min(1, w / (vw * s), (h - CAPTION) / (vh * s));
  const ps = s * fit;
  const width = vw * ps;
  const height = vh * ps;
  const left = (w - width) / 2;
  const top = CAPTION + (h - CAPTION - height) / 2;
  const at = (p: { x: number; y: number }) => ({ x: left + (p.x - vx) * ps, y: top + (p.y - vy) * ps });
  const pins: BoardGeometry["pins"] = {};
  for (const [id, spec] of Object.entries(model.canvas.pins)) pins[id] = { ...at(spec), position: sideOf(spec, model) };
  const usb = model.canvas.usb ? { ...at(model.canvas.usb), angle: usbAngle(model.canvas.usb.from) } : null;
  return { w, h, scale: ps, graphic: { left, top, width, height }, pins, usb, caption: CAPTION, view: v3 };
}

/** The node box a bare board takes, the same in 2D and 3D. */
export function boardBox(partId: string): { w: number; h: number } | null {
  const g = boardGeometry(partId, "reality");
  return g ? { w: g.w, h: g.h } : null;
}
