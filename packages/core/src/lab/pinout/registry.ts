import { BREADBOARD_SPECS, type BreadboardSpec } from "../../parts/models/breadboard";
import { type LabPin, type PinTone, type Pinout } from "./types";
import { L, R, pp } from "./helpers";
import { ESP32, ESP8266, MEGA, MICROBIT, PI4, PICO, STM32, TEENSY, UNO } from "./boards";
import { PERIPHERALS } from "./peripherals";

// ----- prototyping -------------------------------------------------------------

function terminalNote(id: string): string {
  const col = id.slice(1);
  const [first, last] = /^[a-e]/.test(id) ? ["a", "e"] : ["f", "j"];
  return `Joined to ${first}${col}–${last}${col}: one five-hole strip`;
}

/** Every hole is a pin; the strips say which holes share a clip. */
function breadboardPinout(spec: BreadboardSpec): Pinout {
  const middle = spec.size.h / 2;
  return {
    partId: spec.partId,
    controller: false,
    passive: true,
    logic: 5,
    tolerates5V: true,
    pins: spec.holes.map((h): LabPin => {
      const rail = h.rail ? spec.rails[h.rail] : undefined;
      return {
        id: h.id,
        label: h.label,
        side: h.y < middle ? L : R,
        fns: rail ? [rail.sign === "+" ? "power" : "ground"] : undefined,
        role: rail ? undefined : "opt",
        note: rail
          ? `${rail.label} rail: all ${spec.railHoles} holes are joined`
          : terminalNote(h.id),
      };
    }),
    strips: spec.strips,
  };
}

const BREADBOARDS: Pinout[] = Object.values(BREADBOARD_SPECS).map(breadboardPinout);

/** A resistor: two legs, no polarity. It joins nothing inside; the analysis follows current through it. */
const RESISTOR: Pinout = {
  partId: "resistor",
  controller: false,
  passive: true,
  logic: 5,
  tolerates5V: true,
  pins: [
    { id: "1", label: "Leg 1", side: L, role: "opt", note: "Either way round" },
    { id: "2", label: "Leg 2", side: R, role: "opt", note: "Either way round" },
  ],
};

const ALL: Pinout[] = [
  UNO,
  ESP32,
  PICO,
  MEGA,
  ESP8266,
  STM32,
  PI4,
  MICROBIT,
  TEENSY,
  ...BREADBOARDS,
  RESISTOR,
  ...PERIPHERALS,
];

const BY_ID = new Map(ALL.map((p) => [p.partId, p]));

export const PINOUTS: readonly Pinout[] = ALL;

const GENERIC: Pinout = {
  partId: "generic",
  controller: false,
  logic: 3.3,
  tolerates5V: false,
  supply: [3, 5.5],
  pins: [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("SIG", "Signal", "io", false)],
};

export function getPinout(partId: string): Pinout {
  return BY_ID.get(partId) ?? { ...GENERIC, partId };
}

export function hasPinout(partId: string): boolean {
  return BY_ID.has(partId);
}

export function getPin(partId: string, pinId: string): LabPin | undefined {
  return getPinout(partId).pins.find((p) => p.id === pinId);
}

export function pinTone(pin: LabPin): PinTone {
  const fns = pin.fns ?? [];
  const role = pin.role;
  if (fns.includes("power") || role === "vcc") return "power";
  if (fns.includes("ground") || role === "gnd") return "ground";
  if (role === "opt" || role === "load") return "muted";
  if (role === "out-analog") return "analog";
  if (role === "pwm") return "pwm";
  if (role && BUS_TONES.includes(role)) return "bus";
  return toneOfFns(fns);
}

const BUS_TONES = ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"];

/** A board pin's tone from what it can do. */
function toneOfFns(fns: string[]): PinTone {
  if (fns.some((f) => BUS_TONES.includes(f))) return "bus";
  if (fns.includes("pwm")) return "pwm";
  if (fns.includes("analog") && !fns.includes("pwm")) return "analog";
  return "digital";
}
