import type { PinRole } from "../pinout";
import type { PinRef } from "../types";

export type Severity = "error" | "warning" | "tip";

export interface Fault {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  nodes: string[];
  wires: string[];
}

export type NetKind = "power" | "ground" | "signal" | "short" | "conflict" | "open";

export interface Net {
  id: string;
  pins: PinRef[];
  wires: string[];
  kind: NetKind;
  /** Supply voltage on a power net. */
  voltage?: number;
  /** A readable name: "5V rail", "GND", "D13", "SDA". */
  label: string;
}

export type PartStatus = "idle" | "unpowered" | "partial" | "ready" | "fault";

export interface BoardLink {
  /** The board pin a peripheral pin is wired to. */
  board: string;
  boardPin: string;
  pin: string;
  role: PinRole;
}

export interface NodeReport {
  status: PartStatus;
  powered: boolean;
  grounded: boolean;
  supplyV: number | null;
  links: BoardLink[];
  faults: Fault[];
  /** Pins with at least one wire. */
  wiredPins: Set<string>;
  /** Resistance in series with the part's drive and ground (an LED's resistor), in ohms. 0 when there is none. */
  seriesOhms?: number;
}

export interface BoardToBoard {
  a: string;
  b: string;
  aPin: string;
  bPin: string;
  bus: "uart" | "i2c" | "spi" | "gpio" | "power";
}

export interface Analysis {
  nets: Net[];
  netOfPin: Map<string, string>;
  netOfWire: Map<string, string>;
  nodes: Record<string, NodeReport>;
  faults: Fault[];
  boardLinks: BoardToBoard[];
}

export const pinKey = (ref: PinRef) => `${ref.node}:${ref.pin}`;

/** A red 5 mm LED's forward voltage, and the series resistor the lab assumes (it has no resistor part). */
export const LED_FORWARD_V = 2;
export const LED_SERIES_OHMS = 220;

/** An LED's current limit; above it the LED (and the pin) is overdriven. */
export const LED_MAX_MA = 20;

/** Current through an LED and `ohms` in series from a pin at `pinV` volts, in mA (220 Ω when no resistor is wired). */
export function ledCurrentMa(pinV: number, ohms: number = LED_SERIES_OHMS): number {
  return (Math.max(0, pinV - LED_FORWARD_V) / Math.max(1, ohms)) * 1000;
}
