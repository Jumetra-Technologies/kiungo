import { MATERIAL, PCB_TOP, STEEL_TOP } from "./materials";
import { type Solid } from "../types";

/** DIP chip with legs along its long sides. */
export function dip({
  x,
  y,
  pinsPerSide,
  label,
  width = 7.6,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  pinsPerSide: number;
  label: string;
  width?: number;
  z?: number;
}): Solid[] {
  const length = pinsPerSide * 2.54;
  return [
    {
      kind: "box",
      x,
      y,
      w: length,
      h: width,
      d: 3.8,
      z: z + 0.6,
      top: "linear-gradient(180deg,#232428,#17181b)",
      side: MATERIAL.icSide,
      fill: MATERIAL.ic,
      label: { text: label, size: 1.6, color: "#a3a7ad" },
      finish: "epoxy",
      radius: 0.4,
    },
    // The legs: flat tinned strips bent down from the body's sides to the board.
    {
      kind: "pins",
      x,
      y: y - 1.37,
      count: pinsPerSide,
      pitch: 2.54,
      dir: "x",
      len: 2.2,
      z,
      size: 0.5,
      color: MATERIAL.tin,
      finish: "tin",
    },
    {
      kind: "pins",
      x,
      y: y + width - 1.17,
      count: pinsPerSide,
      pitch: 2.54,
      dir: "x",
      len: 2.2,
      z,
      size: 0.5,
      color: MATERIAL.tin,
      finish: "tin",
    },
  ];
}

/** Flat square IC (QFN/QFP/module can). */
export function chip({
  x,
  y,
  w,
  h,
  label,
  d = 1,
  id,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  d?: number;
  id?: string;
  z?: number;
}): Solid {
  return {
    kind: "box",
    id,
    x,
    y,
    w,
    h,
    d,
    z,
    top: "linear-gradient(180deg,#232428,#17181b)",
    side: MATERIAL.icSide,
    fill: MATERIAL.ic,
    radius: 0.3,
    label: label ? { text: label, size: Math.min(1.6, w / 7), color: "#a3a7ad" } : undefined,
    finish: "epoxy",
  };
}

/** A metal RF shield can, as on ESP32 and Wi-Fi modules. */
export function shieldCan({
  x,
  y,
  w,
  h,
  label,
  d = 3,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  d?: number;
  z?: number;
}): Solid {
  return {
    kind: "box",
    id: "shield",
    x,
    y,
    w,
    h,
    d,
    z,
    top: "linear-gradient(135deg,#d7dadf,#aeb3ba)",
    side: MATERIAL.steelSide,
    fill: MATERIAL.steel,
    radius: 0.5,
    label: { text: label, size: Math.min(2, w / 9), color: "#4b5059" },
    finish: "metal",
  };
}

/**
 * A Wi-Fi module (ESP-WROOM-32, ESP-12E): its own black PCB soldered onto the
 * board, a steel shield over the chip at one end, and at the other the
 * antenna, a copper meander you see through the black mask.
 */
export function wifiModule({
  x,
  y,
  w,
  h,
  shieldW,
  label,
  antenna = "right",
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  shieldW: number;
  label: string;
  antenna?: "right" | "left";
  z?: number;
}): Solid[] {
  const top = z + 0.8;
  const shieldX = antenna === "right" ? x + 0.6 : x + w - 0.6 - shieldW;
  const antX = antenna === "right" ? shieldX + shieldW + 0.8 : x + 0.8;
  const antW = w - shieldW - 2.2;
  // The meander: across and back, step by step along the module's width.
  const steps = 7;
  const step = (h - 3) / steps;
  let d = `M ${antX} ${y + 1.5}`;
  for (let i = 0; i < steps; i++) {
    const yy = y + 1.5 + i * step;
    d += ` L ${antX + antW} ${yy} L ${antX + antW} ${yy + step / 2} L ${antX} ${yy + step / 2} L ${antX} ${yy + step}`;
  }
  return [
    {
      kind: "box",
      id: "module",
      x,
      y,
      w,
      h,
      d: 0.8,
      z,
      top: "#1b1c1e",
      finish: "soldermask",
      radius: 0.3,
    },
    shieldCan({ x: shieldX, y: y + 0.6, w: shieldW, h: h - 1.2, label, d: 2.4, z: top }),
    { kind: "path", d, color: "#33363b", width: 0.45, z: top },
    // Castellated pads round the module's edge, soldered to the board.
    ...Array.from({ length: Math.floor((w - antW - 2) / 1.27) }, (_, i): Solid => ({
      kind: "disc",
      cx: (antenna === "right" ? x + 1 : x + antW + 1.6) + i * 1.27,
      cy: y + h - 0.35,
      r: 0.35,
      color: MATERIAL.gold,
      z: top,
    })),
  ];
}

/** HC-49/S crystal: a flat steel can with round ends, its frequency stamped on top. */
export function crystal({
  x,
  y,
  label = "16.000",
  w = 11,
  h = 4.65,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  label?: string;
  w?: number;
  h?: number;
  z?: number;
}): Solid {
  return {
    kind: "box",
    id: "crystal",
    x,
    y,
    w,
    h,
    d: 3.5,
    z,
    top: STEEL_TOP,
    fill: MATERIAL.steel,
    radius: h / 2 - 0.05,
    finish: "metal",
    label: { text: label, size: 1.4, color: "#5d636b" },
  };
}

/** SOT-223 regulator: a black body, its wide tab on one side and three legs on the other. */
export function sot223(x: number, y: number, label = "1117", z = PCB_TOP): Solid[] {
  const solids: Solid[] = [
    {
      kind: "box",
      x,
      y: y + 1.2,
      w: 6.5,
      h: 3.5,
      d: 1.6,
      z,
      top: MATERIAL.ic,
      fill: MATERIAL.ic,
      radius: 0.15,
      finish: "epoxy",
      label: { text: label, size: 1.1, color: "#9aa0a6" },
    },
    {
      kind: "box",
      x: x + 1.75,
      y: y,
      w: 3,
      h: 1.4,
      d: 0.25,
      z,
      top: MATERIAL.tin,
      finish: "tin",
      radius: 0.05,
    },
  ];
  for (let i = 0; i < 3; i++)
    solids.push({
      kind: "box",
      x: x + 0.95 + i * 2.3 - 0.35,
      y: y + 4.6,
      w: 0.7,
      h: 1.4,
      d: 0.25,
      z,
      top: MATERIAL.tin,
      finish: "tin",
      radius: 0.05,
    });
  return solids;
}

/** Quad flat package: a black square with fine legs on all four sides (STM32, ATmega2560, 16U2's bigger cousins). */
export function qfp({
  x,
  y,
  side,
  perSide,
  label,
  id,
  z = PCB_TOP,
}: {
  x: number;
  y: number;
  side: number;
  perSide: number;
  label?: string;
  id?: string;
  z?: number;
}): Solid[] {
  const leg = 1;
  const solids: Solid[] = [
    {
      kind: "box",
      id,
      x: x + leg,
      y: y + leg,
      w: side - 2 * leg,
      h: side - 2 * leg,
      d: 1.4,
      z,
      top: MATERIAL.ic,
      fill: MATERIAL.ic,
      radius: 0.2,
      finish: "epoxy",
      label: label ? { text: label, size: Math.min(1.5, side / 9), color: "#9aa0a6" } : undefined,
    },
  ];
  const run = side - 2 * leg;
  const p = run / perSide;
  solids.push({
    kind: "pins",
    x: x + leg,
    y: y + 0.15,
    count: perSide,
    pitch: p,
    dir: "x",
    len: 0.25,
    z,
    size: Math.min(0.3, p * 0.55),
    finish: "tin",
  });
  solids.push({
    kind: "pins",
    x: x + leg,
    y: y + side - 0.15 - p,
    count: perSide,
    pitch: p,
    dir: "x",
    len: 0.25,
    z,
    size: Math.min(0.3, p * 0.55),
    finish: "tin",
  });
  solids.push({
    kind: "pins",
    x: x + 0.15,
    y: y + leg,
    count: perSide,
    pitch: p,
    dir: "y",
    len: 0.25,
    z,
    size: Math.min(0.3, p * 0.55),
    finish: "tin",
  });
  solids.push({
    kind: "pins",
    x: x + side - 0.15 - p,
    y: y + leg,
    count: perSide,
    pitch: p,
    dir: "y",
    len: 0.25,
    z,
    size: Math.min(0.3, p * 0.55),
    finish: "tin",
  });
  return solids;
}
