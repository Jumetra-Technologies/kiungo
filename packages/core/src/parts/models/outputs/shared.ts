import { type Solid } from "../../types";

/** A single component leg hanging below z = 0, centered at (cx, cy). */
export function leg(cx: number, cy: number, len: number): Solid {
  return {
    kind: "pins",
    x: cx - 1.27,
    y: cy - 1.27,
    count: 1,
    pitch: 2.54,
    dir: "x",
    len: -len,
    z: 0,
    size: 0.5,
  };
}

export const TAN = { top: "#b9a67a", side: "#8a7a55" };
