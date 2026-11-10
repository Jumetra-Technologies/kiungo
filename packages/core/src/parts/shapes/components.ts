import { MATERIAL, PCB_TOP, STEEL_TOP, shade } from "./materials";
import { type Solid } from "../types";

/** Surface-mount LED, lit color given. */
export function smdLed(x: number, y: number, color: string, id: string, z = PCB_TOP): Solid {
  // Off, an SMD LED is a pale lens tinted by its color; lit, it glows.
  const lens = shade(color, 0.55);
  return {
    kind: "box",
    id,
    x,
    y,
    w: 1.6,
    h: 0.8,
    d: 0.6,
    z,
    top: lens,
    side: shade(color, 0.4),
    glow: color,
    radius: 0.2,
    finish: "plastic",
  };
}

/** 5 mm through-hole LED: base rim, body and dome. */
export function led5mm({
  cx,
  cy,
  color,
  id,
  z = 0,
  clear = false,
}: {
  cx: number;
  cy: number;
  color: string;
  id: string;
  z?: number;
  clear?: boolean;
}): Solid[] {
  return [
    {
      kind: "cyl",
      cx,
      cy,
      r: 2.9,
      d: 1,
      z,
      top: shade(color, 0.85),
      side: shade(color, 0.6),
      segments: 16,
    },
    {
      kind: "cyl",
      id: `${id}-body`,
      cx,
      cy,
      r: 2.5,
      d: 5.5,
      z: z + 1,
      top: color,
      side: shade(color, 0.8),
      segments: 16,
      glow: color,
    },
    { kind: "dome", id, cx, cy, r: 2.5, d: 2.3, z: z + 6.5, color, glow: color, clear },
  ];
}

/** Electrolytic capacitor can. */
/**
 * Aluminium electrolytic capacitor. "smd": a bare aluminium can on a black
 * plastic base, its negative side marked by a black arc on top. "radial": a
 * through-hole can in a dark sleeve with a pale stripe down the negative side.
 */
export function capacitor({
  cx,
  cy,
  r,
  d,
  z = 0,
  style = "smd",
}: {
  cx: number;
  cy: number;
  r: number;
  d: number;
  z?: number;
  style?: "smd" | "radial";
}): Solid[] {
  if (style === "radial") {
    return [
      { kind: "cyl", cx, cy, r, d, z, top: "#20242c", fill: "#20242c", finish: "plastic" },
      { kind: "disc", cx, cy, r: r * 0.8, color: "#a7acb3", z: z + d + 0.01 },
      {
        kind: "path",
        d: `M ${cx - r * 0.45} ${cy} L ${cx + r * 0.45} ${cy} M ${cx} ${cy - r * 0.45} L ${cx} ${cy + r * 0.45}`,
        color: "#6b7078",
        width: 0.25,
        z: z + d + 0.02,
      },
    ];
  }
  const base = Math.min(1.2, d * 0.18);
  return [
    {
      kind: "box",
      x: cx - r - 0.25,
      y: cy - r - 0.25,
      w: 2 * r + 0.5,
      h: 2 * r + 0.5,
      d: base,
      z,
      top: "#16171a",
      finish: "plastic",
      radius: 0.4,
    },
    {
      kind: "cyl",
      cx,
      cy,
      r,
      d: d - base,
      z: z + base,
      top: "#c3c7cc",
      fill: "#c3c7cc",
      finish: "metal",
    },
    // The polarity mark, and the cross the vent is scored in.
    {
      kind: "path",
      d: `M ${cx - r * 0.82} ${cy - r * 0.5} A ${r * 0.95} ${r * 0.95} 0 0 1 ${cx - r * 0.82} ${cy + r * 0.5} Z`,
      fill: "#141518",
      color: "none",
      z: z + d + 0.01,
    },
    {
      kind: "path",
      d: `M ${cx - r * 0.35} ${cy} L ${cx + r * 0.55} ${cy} M ${cx + r * 0.1} ${cy - r * 0.45} L ${cx + r * 0.1} ${cy + r * 0.45}`,
      color: "#8a9098",
      width: 0.18,
      z: z + d + 0.01,
    },
  ];
}

/** Screw terminal block (blue or green). */
export function screwTerminal({
  x,
  y,
  poles,
  color = "#1e5fbf",
  pitch = 5,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  poles: number;
  color?: string;
  pitch?: number;
  z?: number;
}): Solid[] {
  const w = poles * pitch;
  const solids: Solid[] = [
    { kind: "box", x, y, w, h: 7.5, d: 9, z, top: color, side: shade(color, 0.6), radius: 0.6 },
  ];
  for (let i = 0; i < poles; i++) {
    solids.push({
      kind: "disc",
      cx: x + pitch / 2 + i * pitch,
      cy: y + 3.2,
      r: 1.5,
      color: MATERIAL.steel,
      z: z + 9,
      ring: { color: "#6b7280", width: 0.3 },
    });
  }
  return solids;
}

/** Tactile push button. */
/** Tactile push button: a black body, the steel frame crimped over it, and the round actuator. */
export function tactileButton({
  x,
  y,
  size = 6,
  id,
  z = PCB_TOP,
  actuator = "#2a2c31",
}: {
  x: number;
  y: number;
  size?: number;
  id?: string;
  z?: number;
  actuator?: string;
}): Solid[] {
  const body = Math.max(1.2, size * 0.45);
  return [
    {
      kind: "box",
      x,
      y,
      w: size,
      h: size,
      d: body,
      z,
      top: MATERIAL.plasticBlack,
      side: "#111214",
      radius: 0.3,
      finish: "plastic",
    },
    {
      kind: "box",
      x: x + 0.15,
      y: y + 0.15,
      w: size - 0.3,
      h: size - 0.3,
      d: 0.25,
      z: z + body,
      top: STEEL_TOP,
      fill: MATERIAL.steel,
      radius: 0.25,
      finish: "metal",
    },
    {
      kind: "cyl",
      id,
      cx: x + size / 2,
      cy: y + size / 2,
      r: size * 0.29,
      d: size * 0.22,
      z: z + body + 0.25,
      top: actuator,
      fill: actuator,
      finish: "plastic",
    },
  ];
}

/**
 * Tiny surface-mount resistors and capacitors, the specks that cover a real
 * board: a body with tinned ends. `kind` r is a black resistor, c a tan capacitor.
 */
export function smd({
  x,
  y,
  kind = "r",
  dir = "x",
  size = "0603",
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  kind?: "r" | "c";
  dir?: "x" | "y";
  size?: "0603" | "0805";
  z?: number;
}): Solid[] {
  const [l, wd] = size === "0603" ? [1.6, 0.8] : [2, 1.25];
  const w = dir === "x" ? l : wd;
  const h = dir === "x" ? wd : l;
  const body: Solid = {
    kind: "box",
    x,
    y,
    w,
    h,
    d: 0.5,
    z,
    top: kind === "r" ? "#17181b" : "#b9a27a",
    finish: kind === "r" ? "epoxy" : "ceramic",
    radius: 0.05,
  };
  const cap = l * 0.18;
  const ends: Solid[] =
    dir === "x"
      ? [
          {
            kind: "box",
            x: x - 0.02,
            y: y - 0.02,
            w: cap,
            h: h + 0.04,
            d: 0.52,
            z,
            top: MATERIAL.tin,
            finish: "tin",
            radius: 0.05,
          },
          {
            kind: "box",
            x: x + w - cap + 0.02,
            y: y - 0.02,
            w: cap,
            h: h + 0.04,
            d: 0.52,
            z,
            top: MATERIAL.tin,
            finish: "tin",
            radius: 0.05,
          },
        ]
      : [
          {
            kind: "box",
            x: x - 0.02,
            y: y - 0.02,
            w: w + 0.04,
            h: cap,
            d: 0.52,
            z,
            top: MATERIAL.tin,
            finish: "tin",
            radius: 0.05,
          },
          {
            kind: "box",
            x: x - 0.02,
            y: y + h - cap + 0.02,
            w: w + 0.04,
            h: cap,
            d: 0.52,
            z,
            top: MATERIAL.tin,
            finish: "tin",
            radius: 0.05,
          },
        ];
  return [body, ...ends];
}

/** A row of SMD parts, for the clusters around a chip. */
export function smdRow({
  x,
  y,
  count,
  step,
  along = "x",
  kinds = "rcrc",
  dir = along === "x" ? "y" : "x",
}: {
  x: number;
  y: number;
  count: number;
  step: number;
  along?: "x" | "y";
  kinds?: string;
  dir?: "x" | "y";
}): Solid[] {
  const out: Solid[] = [];
  for (let i = 0; i < count; i++) {
    const k = kinds[i % kinds.length] === "c" ? "c" : "r";
    out.push(
      ...smd({
        x: along === "x" ? x + i * step : x,
        y: along === "y" ? y + i * step : y,
        kind: k,
        dir,
      }),
    );
  }
  return out;
}

/**
 * A cylinder lying on its side along x, built from stacked slabs whose widths
 * follow the circle. Motor cans, crystals, round bodies that are not upright.
 */
export function lyingCylinder({
  x,
  cy,
  length,
  r,
  color,
  z = 0,
  id,
  layers = 7,
}: {
  x: number;
  cy: number;
  length: number;
  r: number;
  color: string;
  z?: number;
  id?: string;
  layers?: number;
}): Solid[] {
  const solids: Solid[] = [];
  const step = (2 * r) / layers;
  for (let i = 0; i < layers; i++) {
    const zc = i * step + step / 2;
    const half = Math.sqrt(Math.max(0, r * r - (zc - r) * (zc - r)));
    const tone = shade(color, 0.72 + 0.4 * (zc / (2 * r)));
    solids.push({
      kind: "box",
      id: i === layers - 1 ? id : undefined,
      x,
      y: cy - half,
      w: length,
      h: half * 2,
      d: step,
      z: z + i * step,
      top: tone,
      side: shade(tone, 0.8),
      fill: color,
      radius: Math.min(half, 1),
    });
  }
  return solids;
}

/** Square trimmer potentiometer with a screw slot on top. */
export function trimPot({
  x,
  y,
  size = 6,
  color = "#d9772b",
  id,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  size?: number;
  color?: string;
  id?: string;
  z?: number;
}): Solid[] {
  return [
    {
      kind: "box",
      id,
      x,
      y,
      w: size,
      h: size,
      d: 4.5,
      z,
      top: color,
      side: shade(color, 0.65),
      radius: 0.4,
    },
    {
      kind: "disc",
      cx: x + size / 2,
      cy: y + size / 2,
      r: size * 0.3,
      color: MATERIAL.steel,
      z: z + 4.5,
      ring: { color: shade(color, 0.5), width: 0.25 },
    },
    {
      kind: "path",
      d: `M ${x + size / 2 - size * 0.22} ${y + size / 2} L ${x + size / 2 + size * 0.22} ${y + size / 2}`,
      color: "#4b5059",
      width: 0.35,
      z: z + 4.55,
    },
  ];
}
