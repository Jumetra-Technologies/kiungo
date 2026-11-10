import { type Solid } from "../types";
import { MATERIAL, PCB_TOP, shade } from "./materials";

export function pcb(w: number, h: number, color: string, edge?: string, radius = 1.5): Solid {
  return {
    kind: "box",
    id: "pcb",
    x: 0,
    y: 0,
    w,
    h,
    d: 1.6,
    top: color,
    side: edge ?? shade(color, 0.55),
    radius,
    finish: "soldermask",
  };
}

/** Female header: a black strip with holes. */
export function header({
  x,
  y,
  count,
  dir,
  rows = 1,
  pitch = 2.54,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  count: number;
  dir: "x" | "y";
  rows?: number;
  pitch?: number;
  z?: number;
}): Solid {
  const long = count * pitch;
  const short = rows * pitch;
  return {
    kind: "box",
    x,
    y,
    w: dir === "x" ? long : short,
    h: dir === "x" ? short : long,
    d: 8.5,
    z,
    top: MATERIAL.header,
    side: MATERIAL.headerSide,
    holes: { count, rows },
    radius: 0.3,
    finish: "plastic",
  };
}

/** Male pins standing up, or hanging below the board when len is negative. */
export function pinRow({
  x,
  y,
  count,
  dir,
  len = 6,
  rows = 1,
  z,
}: {
  x: number;
  y: number;
  count: number;
  dir: "x" | "y";
  len?: number;
  rows?: number;
  z?: number;
}): Solid {
  return { kind: "pins", x, y, count, pitch: 2.54, dir, len, rows, z, finish: "gold" };
}

/** How far a soldered pin pokes up through the top of the board. */
export const SOLDER_STUB = 1;

/**
 * A male pin header. Standing up (`below` false): the black plastic on the
 * board and the pins rising 6 mm out of it, as on a Raspberry Pi's GPIO.
 * Hanging below (the default, as on a DevKit or Blue Pill made for a
 * breadboard): the plastic is under the board, the pins go 6 mm further
 * down, and the top shows a row of tinned pads with the pin ends poking
 * through their solder.
 */
export function maleHeader({
  x,
  y,
  count,
  dir,
  rows = 1,
  below = true,
  z = PCB_TOP,
  pad = MATERIAL.tin,
}: {
  x: number;
  y: number;
  count: number;
  dir: "x" | "y";
  rows?: number;
  below?: boolean;
  z?: number;
  pad?: string;
}): Solid[] {
  const long = count * 2.54;
  const short = rows * 2.54;
  const w = dir === "x" ? long : short;
  const h = dir === "x" ? short : long;
  if (!below) {
    return [
      {
        kind: "box",
        x,
        y,
        w,
        h,
        d: 2.5,
        z,
        top: MATERIAL.header,
        side: MATERIAL.headerSide,
        radius: 0.3,
        finish: "plastic",
      },
      pinRow({ x, y, count, dir, len: 6, rows, z: z + 2.5 }),
    ];
  }
  const under = z - PCB_TOP - 2.5;
  const solids: Solid[] = [
    {
      kind: "box",
      x,
      y,
      w,
      h,
      d: 2.5,
      z: under,
      top: MATERIAL.header,
      side: MATERIAL.headerSide,
      radius: 0.3,
      finish: "plastic",
    },
    // One pin from 6 mm below the plastic, through the board, to the stub above it.
    pinRow({ x, y, count, dir, len: 6 + 2.5 + PCB_TOP + SOLDER_STUB, rows, z: under - 6 }),
  ];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5) * 2.54;
      const across = (r + 0.5) * 2.54;
      const cx = dir === "x" ? x + along : x + across;
      const cy = dir === "x" ? y + across : y + along;
      // The solder: a low tinned cone round the pin, on its pad.
      solids.push({ kind: "disc", cx, cy, r: 0.85, color: pad, z });
      solids.push({ kind: "dome", cx, cy, r: 0.7, d: 0.55, z, color: MATERIAL.tin, finish: "tin" });
    }
  }
  return solids;
}

/** Silkscreen text helper. */
export function silk({
  x,
  y,
  text,
  size = 1.4,
  color = MATERIAL.silk,
  extra,
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
  color?: string;
  extra?: Partial<Extract<Solid, { kind: "text" }>>;
}): Solid {
  return { kind: "text", x, y, text, size, color, ...extra };
}

/** A mounting hole with a copper ring. */
export function mountHole(cx: number, cy: number, r = 1.6): Solid {
  return { kind: "disc", cx, cy, r, color: "#0b0c0e", ring: { color: MATERIAL.gold, width: 0.6 } };
}

/** Component legs lying flat along +y from a body edge, for parts drawn lying on their back. */
export function flatLegs({
  x,
  y,
  count,
  len,
  pitch = 2.54,
  z = 0,
}: {
  x: number;
  y: number;
  count: number;
  len: number;
  pitch?: number;
  z?: number;
}): Solid[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        kind: "box",
        x: x + i * pitch - 0.25,
        y,
        w: 0.5,
        h: len,
        d: 0.5,
        z,
        top: MATERIAL.tin,
        side: "#7d8289",
        radius: 0.2,
      }) as Solid,
  );
}

/** A flat lead or wire running along x or y. */
export function wire({
  x,
  y,
  w,
  h,
  color,
  z = 0,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  z?: number;
}): Solid {
  return {
    kind: "box",
    x,
    y,
    w,
    h,
    d: Math.min(w, h),
    z,
    top: color,
    side: shade(color, 0.7),
    radius: Math.min(w, h) / 2,
  };
}

/** A row of gold pads (castellations, solder pads) along x or y. */
export function pads({
  x,
  y,
  count,
  dir,
  pitch = 2.54,
  r = 0.55,
  z,
  color = MATERIAL.gold,
}: {
  x: number;
  y: number;
  count: number;
  dir: "x" | "y";
  pitch?: number;
  r?: number;
  z?: number;
  color?: string;
}): Solid[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        kind: "disc",
        cx: dir === "x" ? x + i * pitch : x,
        cy: dir === "y" ? y + i * pitch : y,
        r,
        color,
        z,
      }) as Solid,
  );
}
