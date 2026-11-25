/**
 * The 3D renderer's geometry, shared with the lab canvas so that wires can be
 * attached to a tilted board at exactly the pixel the pin is drawn.
 *
 * The renderer turns the stage with `rotateX(tilt) rotateZ(spin)` about the
 * board's center and lifts it so the part's middle sits mid-stage. With no
 * perspective (as the canvas renders), that is an affine map, and this file
 * is that map.
 */

import type { PartModel } from "./types";

/** The library's turntable tilt; the lift is computed with it. */
export const TILT = 56;
export const SIN_TILT = Math.sin((TILT * Math.PI) / 180);

/** How far the part reaches below its base plane: hanging pins and legs. */
export function dropBelow(model: PartModel): number {
  let below = 0;
  for (const solid of model.solids) {
    if (solid.kind === "pins" && solid.len < 0) below = Math.max(below, -((solid.z ?? 0) + solid.len));
    else if ((solid.kind === "box" || solid.kind === "cyl") && (solid.z ?? 0) < 0) below = Math.max(below, -(solid.z ?? 0));
  }
  return below;
}

/** How far (px) the stage's center sits below the middle of the scene. */
export function stageLift(model: PartModel, s: number): number {
  return ((model.size.d - dropBelow(model)) / 2) * SIN_TILT * s;
}

export interface View3D {
  spin: number;
  tilt: number;
}

/**
 * Where a point on the part (mm, board coordinates, z up out of the board)
 * lands on the scene, in px from the scene's center, for a still view with
 * no perspective.
 */
export function project(model: PartModel, s: number, view: View3D, p: { x: number; y: number; z: number }): { x: number; y: number } {
  const cz = Math.cos((view.spin * Math.PI) / 180);
  const sz = Math.sin((view.spin * Math.PI) / 180);
  const cx = Math.cos((view.tilt * Math.PI) / 180);
  const sx = Math.sin((view.tilt * Math.PI) / 180);
  // Relative to the board center, which is the rotation's origin.
  const x = (p.x - model.size.w / 2) * s;
  const y = (p.y - model.size.h / 2) * s;
  const z = p.z * s;
  // rotateZ(spin), then rotateX(tilt): CSS applies the right-hand transform first.
  const x1 = x * cz - y * sz;
  const y1 = x * sz + y * cz;
  const y2 = y1 * cx - z * sx;
  return { x: x1, y: y2 + stageLift(model, s) };
}

/** The screen angle (degrees, clockwise from +x) of a direction on the board. */
export function projectAngle(model: PartModel, s: number, view: View3D, dir: { x: number; y: number; z?: number }): number {
  const o = project(model, s, view, { x: model.size.w / 2, y: model.size.h / 2, z: 0 });
  const t = project(model, s, view, { x: model.size.w / 2 + dir.x, y: model.size.h / 2 + dir.y, z: dir.z ?? 0 });
  return (Math.atan2(t.y - o.y, t.x - o.x) * 180) / Math.PI;
}
