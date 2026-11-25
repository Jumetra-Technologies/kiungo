/**
 * A through-hole resistor: the part every LED needs and the lab used to
 * assume. Its four color bands follow the value set in the lab (or 220 Ω).
 */

import { MATERIAL, lyingCylinder, shade, wire } from "../build";
import type { PartModel, Solid } from "../types";

/** Values a kit has, in ohms. */
export const RESISTOR_VALUES = [100, 220, 330, 470, 1000, 2200, 4700, 10000] as const;
export const DEFAULT_OHMS = 220;

const DIGIT_COLORS = ["#1b1b1b", "#7a4a1e", "#d32f2f", "#f28c28", "#f4d03f", "#2e8b57", "#2f6fd6", "#7d3cb5", "#8a8f96", "#f4f4f4"];
const GOLD = "#c9a646";

/** "220 Ω", "4.7 kΩ", "10 kΩ". */
export function formatOhms(ohms: number): string {
  if (ohms >= 1000) {
    const k = ohms / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)} kΩ`;
  }
  return `${ohms} Ω`;
}

/** The four bands of a 5 % resistor: two digits, a multiplier, gold. */
export function resistorBands(ohms: number): [string, string, string, string] {
  const digits = String(Math.round(ohms));
  const first = Number(digits[0]);
  const second = Number(digits[1] ?? 0);
  const zeros = Math.max(0, digits.length - 2);
  return [DIGIT_COLORS[first], DIGIT_COLORS[second], DIGIT_COLORS[Math.min(9, zeros)], GOLD];
}

const BODY = "#d9c9a3";
const LEAD_Y = 1.0;
const BODY_X = 4.85;
const BODY_LEN = 6.3;
const BAND_X = [BODY_X + 0.9, BODY_X + 1.9, BODY_X + 2.9, BODY_X + 5.0];

function bands(ohms: number): Solid[] {
  return resistorBands(ohms).map((color, i) => ({
    kind: "box",
    id: `band-${i + 1}`,
    x: BAND_X[i],
    y: 0.02,
    w: 0.62,
    h: 2.46,
    d: 2.42,
    z: 0.02,
    top: color,
    side: shade(color, 0.75),
    fill: color,
    radius: 0.6,
  }));
}

export const RESISTOR: PartModel = {
  id: "resistor",
  name: "Resistor (220 Ω)",
  aka: ["resistor", "current-limiting resistor", "220 ohm resistor", "1k resistor", "10k resistor", "pull-down resistor"],
  group: "prototyping",
  rank: 2,
  summary:
    "Limits current. Put one in series with every LED: from a 5 V pin, 220 Ω lets about 14 mA through, bright and safe for the LED and the pin. Its color bands say its value.",
  size: { w: 16, h: 2.5, d: 2.5 },
  solids: [
    wire(0, LEAD_Y, BODY_X + 0.4, 0.5, MATERIAL.tin, 0.95),
    wire(BODY_X + BODY_LEN - 0.4, LEAD_Y, 16 - (BODY_X + BODY_LEN - 0.4), 0.5, MATERIAL.tin, 0.95),
    ...lyingCylinder(BODY_X, 1.25, BODY_LEN, 1.2, BODY, 0, "body"),
    ...bands(DEFAULT_OHMS),
  ],
  features: [
    { id: "bands", label: "Color bands", kind: "other", x: BAND_X[0], y: 0, w: BAND_X[2] + 0.62 - BAND_X[0], h: 2.5, note: "Read from the end the bands crowd toward: first digit, second digit, how many zeros. Red red brown is 22 and one zero: 220 Ω." },
    { id: "tolerance", label: "Gold band", kind: "other", x: BAND_X[3], y: 0, w: 0.62, h: 2.5, note: "Tolerance: the real value is within 5 % of the printed one." },
    { id: "leg-1", label: "Leg 1", kind: "pin", x: 0, y: 0.75, w: 4.8, h: 1, note: "A resistor has no polarity: either leg goes either way." },
    { id: "leg-2", label: "Leg 2", kind: "pin", x: 11.2, y: 0.75, w: 4.8, h: 1, note: "Bend the legs 0.4\" (4 holes) apart to fit a breadboard." },
  ],
  pins: [
    { name: "Leg 1", role: "other", note: "Either way round" },
    { name: "Leg 2", role: "other", note: "Either way round" },
  ],
  circuit: {
    blocks: [
      { id: "pin", label: "Board pin", sub: "5 V when HIGH", kind: "pin", col: 0, row: 0, note: "The voltage that pushes the current." },
      { id: "res", label: "Resistor", sub: "220 Ω", kind: "passive", col: 1, row: 0, note: "Drops the voltage the LED doesn't: about 3 V here." },
      { id: "led", label: "LED", sub: "drops ~2 V", kind: "actuator", col: 2, row: 0, note: "Takes about 2 V and lights with the current the resistor allows." },
      { id: "gnd", label: "GND", kind: "ground", col: 2, row: 1, note: "The way back." },
    ],
    links: [
      { from: "pin", to: "res", kind: "power", label: "5 V" },
      { from: "res", to: "led", kind: "power", label: "~14 mA" },
      { from: "led", to: "gnd", kind: "ground" },
    ],
    steps: [
      "Ohm's law: current = voltage ÷ resistance. The resistor takes whatever voltage the LED doesn't.",
      "From a 5 V pin with a red LED (about 2 V), the resistor drops 3 V. At 220 Ω that is 3 ÷ 220 ≈ 14 mA.",
      "Less resistance, more current and a brighter LED, up to its limit of about 20 mA. Below about 150 Ω at 5 V you pass it.",
      "It works on either side of the LED, anode or cathode: what matters is that it's in the loop.",
    ],
  },
  facts: [
    { label: "Value", value: "220 Ω (set it in the lab)" },
    { label: "Tolerance", value: "±5 % (gold band)" },
    { label: "Power", value: "¼ W" },
    { label: "Polarity", value: "None" },
    { label: "Body", value: "6.3 × 2.4 mm" },
    { label: "Legs", value: "Bend to 0.4\" for a breadboard" },
  ],
  experiment: {
    title: "Brightness by resistor",
    idea: "Light an LED through 1 kΩ, then 470 Ω, then 220 Ω, and watch the current the lab reports rise each time.",
  },
  tags: ["resistor", "ohm", "passive", "current limit", "led", "220", "1k", "10k", "pull-down", "beginner"],
};

const valueCache = new Map<number, PartModel>();

/** The resistor model with bands and name for `ohms`. */
export function withResistorValue(model: PartModel, ohms: number): PartModel {
  if (model.id !== "resistor") return model;
  const cached = valueCache.get(ohms);
  if (cached) return cached;
  const colors = resistorBands(ohms);
  const next: PartModel = {
    ...model,
    name: `Resistor (${formatOhms(ohms)})`,
    solids: model.solids.map((s) => {
      if (s.kind !== "box" || !s.id?.startsWith("band-")) return s;
      const color = colors[Number(s.id.slice(5)) - 1];
      return { ...s, top: color, side: shade(color, 0.75), fill: color };
    }),
  };
  valueCache.set(ohms, next);
  return next;
}

export const PASSIVES: PartModel[] = [RESISTOR];
