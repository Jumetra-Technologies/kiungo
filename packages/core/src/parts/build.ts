/**
 * Helpers for writing part models: materials, and the shapes that recur
 * across many parts (PCBs, headers, chips, LEDs, screw terminals).
 */
import type { Finish, Solid } from "./types";

/** Top of a standard 1.6 mm PCB: where parts on a board sit. */
export const PCB_TOP = 1.6;

export const MATERIAL = {
  pcbGreen: "#1f6b57",
  pcbGreenEdge: "#0f3a2e",
  pcbBlue: "#1d4f91",
  pcbBlueEdge: "#0f2b52",
  /** The teal of a genuine Uno R3. */
  pcbTeal: "#0f8b8e",
  pcbTealEdge: "#085557",
  pcbBlack: "#1f2124",
  pcbBlackEdge: "#0a0b0c",
  pcbRed: "#8e1c2a",
  pcbRedEdge: "#4a0d15",
  pcbPurple: "#4a2a7a",
  pcbPurpleEdge: "#2a1448",
  pcbWhite: "#e9ecef",
  pcbWhiteEdge: "#b9bec4",
  ic: "#1b1c1f",
  icSide: "#0d0e10",
  header: "#141517",
  headerSide: "#090a0b",
  steel: "#c9ccd1",
  steelSide: "#8f949b",
  gold: "#d9b05c",
  silk: "#e9f1ec",
  silkDark: "#f4f6f8",
  plasticBlue: "#2f6fd6",
  plasticWhite: "#eef0f2",
  plasticBlack: "#26272b",
  copper: "#c77e3a",
  tin: "#a7acb3",
} as const;

/** The brushed-steel top of shells and frames. */
const STEEL_TOP = "linear-gradient(180deg,#d7dadf,#b9bdc3)";

/** Darken or lighten a hex color. factor < 1 darkens. */
export function shade(hex: string, factor: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** The first hex color in a paint string, for flat 2D fills. */
export function flatColor(paint: string): string {
  const match = /#[0-9a-f]{6}/i.exec(paint);
  return match ? match[0] : paint;
}

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
export function header(
  x: number,
  y: number,
  count: number,
  dir: "x" | "y",
  rows = 1,
  pitch = 2.54,
  z = PCB_TOP,
): Solid {
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
export function pinRow(
  x: number,
  y: number,
  count: number,
  dir: "x" | "y",
  len = 6,
  rows = 1,
  z?: number,
): Solid {
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
export function maleHeader(
  x: number,
  y: number,
  count: number,
  dir: "x" | "y",
  rows = 1,
  below = true,
  z = PCB_TOP,
  pad: string = MATERIAL.tin,
): Solid[] {
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
      pinRow(x, y, count, dir, 6, rows, z + 2.5),
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
    pinRow(x, y, count, dir, 6 + 2.5 + PCB_TOP + SOLDER_STUB, rows, under - 6),
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

/** DIP chip with legs along its long sides. */
export function dip(
  x: number,
  y: number,
  pinsPerSide: number,
  label: string,
  width = 7.6,
  z = PCB_TOP,
): Solid[] {
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
export function chip(
  x: number,
  y: number,
  w: number,
  h: number,
  label?: string,
  d = 1,
  id?: string,
  z = PCB_TOP,
): Solid {
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
export function shieldCan(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  d = 3,
  z = PCB_TOP,
): Solid {
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
export function wifiModule(
  x: number,
  y: number,
  w: number,
  h: number,
  shieldW: number,
  label: string,
  antenna: "right" | "left" = "right",
  z = PCB_TOP,
): Solid[] {
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
    shieldCan(shieldX, y + 0.6, shieldW, h - 1.2, label, 2.4, top),
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
export function led5mm(
  cx: number,
  cy: number,
  color: string,
  id: string,
  z = 0,
  clear = false,
): Solid[] {
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
export function capacitor(
  cx: number,
  cy: number,
  r: number,
  d: number,
  z = 0,
  style: "smd" | "radial" = "smd",
): Solid[] {
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
export function screwTerminal(
  x: number,
  y: number,
  poles: number,
  color = "#1e5fbf",
  pitch = 5,
  z = PCB_TOP,
): Solid[] {
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
export function tactileButton(
  x: number,
  y: number,
  size = 6,
  id?: string,
  z = PCB_TOP,
  actuator = "#2a2c31",
): Solid[] {
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

/** Which board edge a connector's opening faces. */
export type Mouth = "left" | "right" | "top" | "bottom";

/**
 * A dark opening (or insert) on one face of a box: the slot of a USB socket,
 * the white tongue of a USB-B. `inset` is how far it sits inside the face,
 * `margin` its border on the face, `lift` its gap above the box's base.
 */
function opening(
  box: { x: number; y: number; w: number; h: number; d: number; z: number },
  mouth: Mouth,
  o: {
    margin: number;
    lift: number;
    height: number;
    depth: number;
    color: string;
    finish?: Finish;
    radius?: number;
  },
): Solid {
  const across = mouth === "left" || mouth === "right" ? box.h : box.w;
  const span = Math.max(0.4, across - o.margin * 2);
  const z = box.z + o.lift;
  const r = o.radius ?? 0.2;
  if (mouth === "left")
    return {
      kind: "box",
      x: box.x - 0.05,
      y: box.y + o.margin,
      w: o.depth,
      h: span,
      d: o.height,
      z,
      top: o.color,
      finish: o.finish,
      radius: r,
    };
  if (mouth === "right")
    return {
      kind: "box",
      x: box.x + box.w + 0.05 - o.depth,
      y: box.y + o.margin,
      w: o.depth,
      h: span,
      d: o.height,
      z,
      top: o.color,
      finish: o.finish,
      radius: r,
    };
  if (mouth === "top")
    return {
      kind: "box",
      x: box.x + o.margin,
      y: box.y - 0.05,
      w: span,
      h: o.depth,
      d: o.height,
      z,
      top: o.color,
      finish: o.finish,
      radius: r,
    };
  return {
    kind: "box",
    x: box.x + o.margin,
    y: box.y + box.h + 0.05 - o.depth,
    w: span,
    h: o.depth,
    d: o.height,
    z,
    top: o.color,
    finish: o.finish,
    radius: r,
  };
}

/** A connector's footprint, turned for the edge it opens on (`long` runs into the board). */
function shell(
  x: number,
  y: number,
  long: number,
  wide: number,
  mouth: Mouth,
): { w: number; h: number } {
  return mouth === "left" || mouth === "right" ? { w: long, h: wide } : { w: wide, h: long };
}

/** Micro-USB socket: a steel shell 5.6 deep, 7.5 wide, 2.8 tall, with its slot on the opening face. */
export function microUsb(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 5.6, 7.5, mouth);
  const body = { x, y, w, h, d: 2.8, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 0.6,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 0.9,
      lift: 0.55,
      height: 1.7,
      depth: 0.5,
      color: "#0c0d0f",
      finish: "plastic",
      radius: 0.5,
    }),
  ];
}

/** USB-C socket: a rounded steel shell with its oval slot. */
export function usbC(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 7.5, 9, mouth);
  const body = { x, y, w, h, d: 3.2, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 1.5,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 0.8,
      lift: 0.5,
      height: 2.2,
      depth: 0.5,
      color: "#0c0d0f",
      finish: "plastic",
      radius: 1,
    }),
  ];
}

/** USB-B socket (Uno, Mega, printers): a tall steel box with its white plastic insert in the opening. */
export function usbB(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 16.3, 12, mouth);
  const body = { x, y, w, h, d: 10.9, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 0.5,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 1.2,
      lift: 1.2,
      height: 8.4,
      depth: 0.6,
      color: "#141518",
      finish: "plastic",
      radius: 0.3,
    }),
    opening(body, mouth, {
      margin: 3.1,
      lift: 3.0,
      height: 4.6,
      depth: 0.9,
      color: "#eceae4",
      finish: "plastic",
      radius: 0.6,
    }),
  ];
}

/** USB-A socket: a steel shell with its plastic tongue (black for USB 2, blue for USB 3). */
export function usbA(
  x: number,
  y: number,
  z = PCB_TOP,
  mouth: Mouth = "left",
  tongue = "#1d1e22",
): Solid[] {
  const { w, h } = shell(x, y, 14.5, 13.5, mouth);
  const body = { x, y, w, h, d: 7, z };
  return [
    {
      kind: "box",
      id: "usb",
      ...body,
      top: STEEL_TOP,
      side: MATERIAL.steelSide,
      fill: MATERIAL.steel,
      radius: 0.5,
      finish: "metal",
    },
    opening(body, mouth, {
      margin: 0.7,
      lift: 0.7,
      height: 5.6,
      depth: 0.5,
      color: "#0c0d0f",
      finish: "plastic",
    }),
    opening(body, mouth, {
      margin: 1.6,
      lift: 3.6,
      height: 1.9,
      depth: 0.8,
      color: tongue,
      finish: "plastic",
    }),
  ];
}

/** DC barrel jack: a black body with the round socket and its center pin on the opening face. */
export function barrelJack(x: number, y: number, z = PCB_TOP, mouth: Mouth = "left"): Solid[] {
  const { w, h } = shell(x, y, 14, 9, mouth);
  const solids: Solid[] = [
    {
      kind: "box",
      id: "jack",
      x,
      y,
      w,
      h,
      d: 11,
      z,
      top: "linear-gradient(180deg,#34363b,#222326)",
      side: "#111214",
      fill: "#2a2c30",
      radius: 0.6,
      finish: "plastic",
    },
  ];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const axis = mouth === "left" || mouth === "right" ? "x" : "y";
  const face =
    mouth === "left"
      ? x - 0.05
      : mouth === "right"
        ? x + w + 0.05
        : mouth === "top"
          ? y - 0.05
          : y + h + 0.05;
  const into = mouth === "left" || mouth === "top" ? 0.4 : -0.4;
  const at = (offset: number) =>
    axis === "x" ? { cx: face + offset, cy } : { cx, cy: face + offset };
  solids.push({
    kind: "cyl",
    ...at(into),
    r: 3.2,
    d: 0.8,
    z: z + 6.5 - 3.2,
    top: "#0b0c0e",
    finish: "plastic",
    axis,
  });
  solids.push({
    kind: "cyl",
    ...at(into * 1.4),
    r: 1.05,
    d: 0.9,
    z: z + 6.5 - 1.05,
    top: "#c9ccd1",
    finish: "metal",
    axis,
  });
  return solids;
}

/** HC-49/S crystal: a flat steel can with round ends, its frequency stamped on top. */
export function crystal(
  x: number,
  y: number,
  label = "16.000",
  w = 11,
  h = 4.65,
  z = PCB_TOP,
): Solid {
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
export function qfp(
  x: number,
  y: number,
  side: number,
  perSide: number,
  label?: string,
  id?: string,
  z = PCB_TOP,
): Solid[] {
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

/**
 * Tiny surface-mount resistors and capacitors, the specks that cover a real
 * board: a body with tinned ends. `kind` r is a black resistor, c a tan capacitor.
 */
export function smd(
  x: number,
  y: number,
  kind: "r" | "c" = "r",
  dir: "x" | "y" = "x",
  size: "0603" | "0805" = "0603",
  z = PCB_TOP,
): Solid[] {
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
export function smdRow(
  x: number,
  y: number,
  count: number,
  step: number,
  along: "x" | "y" = "x",
  kinds = "rcrc",
  dir: "x" | "y" = along === "x" ? "y" : "x",
): Solid[] {
  const out: Solid[] = [];
  for (let i = 0; i < count; i++) {
    const k = kinds[i % kinds.length] === "c" ? "c" : "r";
    out.push(...smd(along === "x" ? x + i * step : x, along === "y" ? y + i * step : y, k, dir));
  }
  return out;
}

/** Silkscreen text helper. */
export function silk(
  x: number,
  y: number,
  text: string,
  size = 1.4,
  color: string = MATERIAL.silk,
  extra?: Partial<Extract<Solid, { kind: "text" }>>,
): Solid {
  return { kind: "text", x, y, text, size, color, ...extra };
}

/** A mounting hole with a copper ring. */
export function mountHole(cx: number, cy: number, r = 1.6): Solid {
  return { kind: "disc", cx, cy, r, color: "#0b0c0e", ring: { color: MATERIAL.gold, width: 0.6 } };
}

/**
 * A cylinder lying on its side along x, built from stacked slabs whose widths
 * follow the circle. Motor cans, crystals, round bodies that are not upright.
 */
export function lyingCylinder(
  x: number,
  cy: number,
  length: number,
  r: number,
  color: string,
  z = 0,
  id?: string,
  layers = 7,
): Solid[] {
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

/** Component legs lying flat along +y from a body edge, for parts drawn lying on their back. */
export function flatLegs(
  x: number,
  y: number,
  count: number,
  len: number,
  pitch = 2.54,
  z = 0,
): Solid[] {
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
export function wire(x: number, y: number, w: number, h: number, color: string, z = 0): Solid {
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

/** Square trimmer potentiometer with a screw slot on top. */
export function trimPot(
  x: number,
  y: number,
  size = 6,
  color = "#d9772b",
  id?: string,
  z = PCB_TOP,
): Solid[] {
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

/** A row of gold pads (castellations, solder pads) along x or y. */
export function pads(
  x: number,
  y: number,
  count: number,
  dir: "x" | "y",
  pitch = 2.54,
  r = 0.55,
  z?: number,
  color: string = MATERIAL.gold,
): Solid[] {
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
