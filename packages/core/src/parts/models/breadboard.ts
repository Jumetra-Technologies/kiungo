/**
 * Solderless breadboards, laid out as the real ones are: a mini (170 points),
 * a half-size (400) and a full-size (830).
 *
 * Columns of terminal strips (rows a–e above the center channel, f–j below;
 * the five holes of one half-column are one strip), and on the half and full
 * sizes four power rails, a + and a − along the top and the bottom edge,
 * each one strip along its whole length. Everything sits on the 0.1"
 * (2.54 mm) grid, so chips straddle the channel and module headers drop in.
 *
 * The lab wires to every hole (`canvas`) and joins the holes of a strip into
 * one net (`strips`, used by `lib/lab/pinout.ts`). That is what a breadboard
 * is for: one 5 V pin on the board feeds the + rail, and every part takes its
 * supply from the rail.
 */

import type { CanvasSpec, PartModel, Solid } from "../types";

/** 0.1" pitch. */
const P = 2.54;
/** Center of column 1. */
const X0 = 4.42;
/** Terminal rows top to bottom; the channel runs between e and f. */
export const TERMINAL_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
type Row = (typeof TERMINAL_ROWS)[number];

export type RailId = "TP" | "TN" | "BN" | "BP";
export interface RailInfo {
  y: number;
  sign: "+" | "−";
  edge: "top" | "bottom";
  label: string;
}

export interface BreadboardHole {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Strip id: holes with the same strip are joined inside the board. */
  strip: string;
  rail?: RailId;
}

/** Everything the lab needs to know about one breadboard's holes. */
export interface BreadboardSpec {
  partId: string;
  columns: number;
  /** Holes per rail; 0 for a mini board with no rails. */
  railHoles: number;
  rails: Partial<Record<RailId, RailInfo>>;
  size: { w: number; h: number; d: number };
  holes: BreadboardHole[];
  strips: string[][];
}

const ROW_STEP: Record<Row, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 7, g: 8, h: 9, i: 10, j: 11 };

function makeSpec(partId: string, columns: number, railHoles: number): BreadboardSpec {
  const withRails = railHoles > 0;
  // Rails take the first 10 mm; a mini starts with row a near the edge.
  const rowA = withRails ? 13.33 : 4.44;
  const rowY = (row: Row) => rowA + ROW_STEP[row] * P;
  const h = withRails ? 54.6 : rowY("j") + 4.44;
  const w = X0 * 2 + (columns - 1) * P;
  const rails: Partial<Record<RailId, RailInfo>> = withRails
    ? {
        TP: { y: 4.44, sign: "+", edge: "top", label: "Top +" },
        TN: { y: 6.98, sign: "−", edge: "top", label: "Top −" },
        BN: { y: 47.62, sign: "−", edge: "bottom", label: "Bottom −" },
        BP: { y: 50.16, sign: "+", edge: "bottom", label: "Bottom +" },
      }
    : {};
  const colX = (col: number) => X0 + (col - 1) * P;
  // Rail holes come in groups of five with a one-hole gap, centered on the terminal columns.
  const slots = railHoles + Math.floor((railHoles - 1) / 5);
  const railX = (n: number) => X0 + (((columns - 1) - (slots - 1)) / 2) * P + (n - 1 + Math.floor((n - 1) / 5)) * P;
  const holes: BreadboardHole[] = [];
  const railRow = (edge: "top" | "bottom") => {
    for (const rail of Object.keys(rails) as RailId[]) {
      const info = rails[rail]!;
      if (info.edge !== edge) continue;
      for (let n = 1; n <= railHoles; n++) holes.push({ id: `${rail}${n}`, label: `${info.label} ${n}`, x: railX(n), y: info.y, strip: rail, rail });
    }
  };
  railRow("top");
  for (const row of TERMINAL_ROWS) {
    for (let col = 1; col <= columns; col++) {
      holes.push({ id: `${row}${col}`, label: `${row}${col}`, x: colX(col), y: rowY(row), strip: `${"abcde".includes(row) ? "a-e" : "f-j"}:${col}` });
    }
  }
  railRow("bottom");
  const by = new Map<string, string[]>();
  for (const hole of holes) by.set(hole.strip, [...(by.get(hole.strip) ?? []), hole.id]);
  return { partId, columns, railHoles, rails, size: { w: Number(w.toFixed(2)), h: Number(h.toFixed(2)), d: 8.5 }, holes, strips: [...by.values()] };
}

/** Every breadboard the lab knows, by part id. */
export const BREADBOARD_SPECS: Record<string, BreadboardSpec> = {
  "breadboard-mini": makeSpec("breadboard-mini", 17, 0),
  breadboard: makeSpec("breadboard", 30, 25),
  "breadboard-full": makeSpec("breadboard-full", 63, 50),
};

export function breadboardSpec(partId: string): BreadboardSpec | undefined {
  return BREADBOARD_SPECS[partId];
}

const HALF = BREADBOARD_SPECS.breadboard;
/** The half-size board's layout (kept for code written before the other sizes). */
export const BREADBOARD_SIZE = HALF.size;
export const BREADBOARD_COLUMNS = HALF.columns;
export const RAIL_HOLES = HALF.railHoles;
export const RAILS = HALF.rails as Record<RailId, RailInfo>;
export const RAIL_IDS = Object.keys(RAILS) as RailId[];
export const BREADBOARD_HOLES: readonly BreadboardHole[] = HALF.holes;
export const BREADBOARD_STRIPS: readonly string[][] = HALF.strips;

/** A readable name for a strip: "Top + rail", "Column 12, a–e". */
export function stripName(stripId: string): string {
  if (stripId in RAILS) return `${RAILS[stripId as RailId].label} rail`;
  const [half, col] = stripId.split(":");
  return `Column ${col}, ${half === "a-e" ? "a–e" : "f–j"}`;
}

const BODY = "#f3f0e7";
const BODY_SIDE = "#bdb6a3";
const HOLE = "#3c3e42";
const PRINT = "#8a8577";
const RED = "#d64545";
const BLUE = "#3567c9";

function text(x: number, y: number, t: string, color = PRINT, size = 1.25, anchor: "start" | "middle" | "end" = "middle"): Solid {
  return { kind: "text", x, y, text: t, size, color, weight: 600, anchor };
}

function solidsFor(spec: BreadboardSpec): Solid[] {
  const { w, h, d } = spec.size;
  const s = 1.05;
  const rowY = (row: Row) => spec.holes.find((x) => x.id === `${row}1`)!.y;
  const channelTop = rowY("e") + 2.41;
  const line = (y: number, color: string): Solid => ({ kind: "path", d: `M 3.2 ${y} L ${(w - 3.2).toFixed(2)} ${y}`, color, width: 0.38 });
  const numbers: number[] = [1];
  for (let c = 5; c <= spec.columns; c += 5) numbers.push(c);
  if (numbers[numbers.length - 1] !== spec.columns) numbers.push(spec.columns);
  const withRails = spec.railHoles > 0;
  return [
    { kind: "box", id: "pcb", x: 0, y: 0, w, h, d, top: BODY, side: BODY_SIDE, radius: 1.2 },
    // The center channel: a groove a DIP chip straddles.
    { kind: "path", d: `M 1.4 ${channelTop.toFixed(2)} L ${(w - 1.4).toFixed(2)} ${channelTop.toFixed(2)} L ${(w - 1.4).toFixed(2)} ${(channelTop + 2.8).toFixed(2)} L 1.4 ${(channelTop + 2.8).toFixed(2)} Z`, color: "#c7c1b1", width: 0.15, fill: "#dcd7c8" },
    ...(withRails
      ? [
          // The seams where the rail strips clip on, and the printed stripes: red beside +, blue beside −.
          { kind: "path", d: `M 0.6 10.2 L ${(w - 0.6).toFixed(2)} 10.2 M 0.6 44.4 L ${(w - 0.6).toFixed(2)} 44.4`, color: "#ddd8ca", width: 0.35 } as Solid,
          line(2.6, RED),
          line(8.8, BLUE),
          line(45.8, BLUE),
          line(52.0, RED),
        ]
      : []),
    { kind: "path", d: spec.holes.map((x) => `M${(x.x - s / 2).toFixed(2)} ${(x.y - s / 2).toFixed(2)}h${s}v${s}h-${s}z`).join(""), color: "none", width: 0, fill: HOLE },
    // + and − at both ends of every rail.
    ...(Object.values(spec.rails) as RailInfo[]).flatMap(({ y, sign }) => {
      const c = sign === "+" ? RED : BLUE;
      return [text(1.7, y + 0.5, sign, c, 1.7), text(w - 1.7, y + 0.5, sign, c, 1.7)];
    }),
    // Row letters at both ends, and column numbers above row a and below row j.
    ...TERMINAL_ROWS.flatMap((row) => [text(2.0, rowY(row) + 0.45, row), text(w - 2.0, rowY(row) + 0.45, row)]),
    ...(withRails ? numbers.flatMap((col) => [text(X0 + (col - 1) * P, rowY("a") - 1.73, String(col), PRINT, 1.15), text(X0 + (col - 1) * P, rowY("j") + 2.48, String(col), PRINT, 1.15)]) : []),
  ];
}

function canvasSpec(spec: BreadboardSpec): CanvasSpec {
  return {
    pins: Object.fromEntries(spec.holes.map((x) => [x.id, { x: x.x, y: x.y }])),
    // Square on and gently tilted, so 0.1" holes stay far enough apart to aim a wire at.
    view: { spin: 0, tilt: 35 },
    pinZ: spec.size.d,
    trace: true,
  };
}

const COMMON = {
  group: "prototyping" as const,
  pins: [
    { name: "+ rails", role: "power" as const, note: "Two rails, one per edge, each one strip end to end. Feed them from the board's 5 V or 3.3 V pin." },
    { name: "− rails", role: "ground" as const, note: "Two ground rails beside the + rails. Feed them from a GND pin." },
    { name: "Strips a–e, f–j", role: "other" as const, note: "Strips of five holes. Put a part's leg and a jumper in the same strip to connect them." },
    { name: "Center channel", role: "mechanical" as const, note: "Not connected; it splits each column in two." },
  ],
  circuit: {
    blocks: [
      { id: "board", label: "Board", sub: "5V and GND pins", kind: "power" as const, col: 0, row: 1, note: "One supply pin and one ground pin on the microcontroller." },
      { id: "plus", label: "+ rail", sub: "one strip", kind: "power" as const, col: 1, row: 0, note: "Every hole on the rail is the same 5 V." },
      { id: "minus", label: "− rail", sub: "one strip", kind: "ground" as const, col: 1, row: 2, note: "Every hole on the rail is ground." },
      { id: "strip", label: "Terminal strip", sub: "5 holes per column", kind: "connector" as const, col: 2, row: 1, note: "A part's leg and a jumper in the same five-hole strip are joined." },
      { id: "parts", label: "Your parts", sub: "VCC, GND, signals", kind: "sensor" as const, col: 3, row: 1, note: "Each takes its supply from the rails and sends its signal to a board pin." },
    ],
    links: [
      { from: "board", to: "plus", kind: "power" as const, label: "5 V" },
      { from: "board", to: "minus", kind: "ground" as const, label: "GND" },
      { from: "plus", to: "parts", kind: "power" as const, label: "VCC" },
      { from: "parts", to: "minus", kind: "ground" as const, label: "GND" },
      { from: "parts", to: "strip", kind: "signal" as const, both: true },
      { from: "strip", to: "board", kind: "signal" as const, label: "to a pin", both: true },
    ],
    steps: [
      "One jumper takes the board's 5 V to the + rail and another takes GND to the − rail. Now every hole on those rails carries 5 V or ground.",
      "Each part's VCC goes to any hole on the + rail and its GND to any hole on the − rail, so one 5 V pin powers as many parts as it can supply.",
      "Inside, a metal clip joins the five holes of each half-column. A part's leg and a jumper pushed into the same strip are connected.",
      "Signals still go to their own board pins: a jumper from the part's strip to D2, A0 and so on.",
    ],
  },
  tags: ["breadboard", "prototyping", "solderless", "power rail", "5v", "gnd", "jumper wires", "beginner"],
};

function features(spec: BreadboardSpec): PartModel["features"] {
  const { w } = spec.size;
  const rowY = (row: Row) => spec.holes.find((x) => x.id === `${row}1`)!.y;
  const list: PartModel["features"] = [
    { id: "strips-top", label: "Terminal strips a–e", kind: "connector", x: 3.2, y: rowY("a") - 1.2, w: w - 6.4, h: 12.6, note: "Each column's five holes, a to e, are one strip: everything pushed into the same column is connected." },
    { id: "channel", label: "Center channel", kind: "mechanical", x: 1.4, y: rowY("e") + 2.41, w: w - 2.8, h: 2.8, note: "Separates a–e from f–j, so a chip straddling it has each pin on its own strip." },
    { id: "strips-bottom", label: "Terminal strips f–j", kind: "connector", x: 3.2, y: rowY("f") - 1.2, w: w - 6.4, h: 12.6, note: `A second set of ${spec.columns} five-hole strips, not joined to the ones above the channel.` },
  ];
  if (spec.railHoles) {
    list.unshift({ id: "rails-top", label: "Power rails, top", kind: "power", x: 3, y: 3.2, w: w - 6, h: 5, note: `A + and a − rail, ${spec.railHoles} holes each. Each rail is one strip end to end: wire the board's 5 V to + and GND to −, and the whole row carries it.` });
    list.push({ id: "rails-bottom", label: "Power rails, bottom", kind: "power", x: 3, y: 46.4, w: w - 6, h: 5, note: "A second pair of rails. Bridge them to the top pair with two short wires, or put a different supply (3.3 V) on them." });
  }
  return list;
}

function breadboardModel(spec: BreadboardSpec, info: Pick<PartModel, "id" | "name" | "aka" | "rank" | "summary" | "facts" | "experiment">): PartModel {
  return {
    ...COMMON,
    ...info,
    size: spec.size,
    solids: solidsFor(spec),
    features: features(spec),
    pins: spec.railHoles ? COMMON.pins : COMMON.pins.filter((p) => !p.name.includes("rails")),
    canvas: canvasSpec(spec),
  };
}

export const BREADBOARD: PartModel = breadboardModel(HALF, {
  id: "breadboard",
  name: "Breadboard (400 points)",
  aka: ["solderless breadboard", "half-size breadboard", "half breadboard", "protoboard", "400-point breadboard", "power rail"],
  rank: 1,
  summary:
    "A half-size solderless breadboard: 30 columns of five-hole strips either side of a center channel, and a + and − power rail along each edge. Wire the board's 5 V and GND to one pair of rails once, and every part takes its power from the rail.",
  facts: [
    { label: "Points", value: "400 (300 terminal, 100 rail)" },
    { label: "Strips", value: "60 × 5 holes, 4 rails × 25" },
    { label: "Pitch", value: "2.54 mm (0.1\")" },
    { label: "Wire", value: "Solid core, 20–29 AWG" },
    { label: "Contacts", value: "Phosphor bronze, about 1 A" },
    { label: "Size", value: "82.5 × 54.6 mm" },
  ],
  experiment: {
    title: "One 5 V pin, three sensors",
    idea: "Wire the Uno's 5 V and GND to the top rails, then power a DHT11, an ultrasonic sensor and a PIR from the rails while each signal goes to its own pin.",
  },
});

export const BREADBOARD_FULL: PartModel = breadboardModel(BREADBOARD_SPECS["breadboard-full"], {
  id: "breadboard-full",
  name: "Breadboard (830 points)",
  aka: ["full-size breadboard", "830-point breadboard", "large breadboard", "MB-102"],
  rank: 3,
  summary:
    "A full-size solderless breadboard: 63 columns of five-hole strips and four 50-hole power rails. Room for a board, a display and a handful of sensors in one build, all fed from the same pair of rails.",
  facts: [
    { label: "Points", value: "830 (630 terminal, 200 rail)" },
    { label: "Strips", value: "126 × 5 holes, 4 rails × 50" },
    { label: "Pitch", value: "2.54 mm (0.1\")" },
    { label: "Wire", value: "Solid core, 20–29 AWG" },
    { label: "Contacts", value: "Phosphor bronze, about 1 A" },
    { label: "Size", value: `${BREADBOARD_SPECS["breadboard-full"].size.w} × 54.6 mm` },
  ],
  experiment: {
    title: "A weather station on one board",
    idea: "Put a DHT22, a BMP280 and an LCD on the full board, all powered from the top rails, and show the readings on the display.",
  },
});

export const BREADBOARD_MINI: PartModel = breadboardModel(BREADBOARD_SPECS["breadboard-mini"], {
  id: "breadboard-mini",
  name: "Breadboard (170 points)",
  aka: ["mini breadboard", "170-point breadboard", "tiny breadboard", "SYB-170"],
  rank: 4,
  summary:
    "A mini solderless breadboard: 17 columns of five-hole strips and no power rails. Small enough to stick on a robot chassis; take power from a strip you feed with jumpers.",
  facts: [
    { label: "Points", value: "170 (all terminal)" },
    { label: "Strips", value: "34 × 5 holes, no rails" },
    { label: "Pitch", value: "2.54 mm (0.1\")" },
    { label: "Wire", value: "Solid core, 20–29 AWG" },
    { label: "Back", value: "Self-adhesive" },
    { label: "Size", value: `${BREADBOARD_SPECS["breadboard-mini"].size.w} × ${BREADBOARD_SPECS["breadboard-mini"].size.h} mm` },
  ],
  experiment: {
    title: "A sensor on the chassis",
    idea: "Mount an ultrasonic sensor on a mini board, feed one strip with 5 V and another with GND, and run the signal to the Uno.",
  },
});

export const PROTOTYPING: PartModel[] = [BREADBOARD, BREADBOARD_FULL, BREADBOARD_MINI];
