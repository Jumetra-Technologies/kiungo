import { type Solid } from "../../types";
import { MATERIAL } from "../../shapes";

/** A printed meander antenna running along y, zig-zagging across x. */
export function meander({
  x,
  y,
  w,
  h,
  turns = 7,
  z,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  turns?: number;
  z?: number;
}): Solid {
  const step = h / turns;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < turns; i++) {
    const py = y + i * step;
    d +=
      i % 2 === 0
        ? ` L ${x + w} ${py} L ${x + w} ${py + step}`
        : ` L ${x} ${py} L ${x} ${py + step}`;
  }
  return { kind: "path", d, color: MATERIAL.gold, width: 0.45, z };
}

export const IC_TOP = "linear-gradient(180deg,#232428,#17181b)";
