import { type LabPin, type PinFn, type PinRole, type Pinout } from "./types";

// ----- helpers ---------------------------------------------------------------

export const L = "left" as const;

export const R = "right" as const;

export function bp(
  id: string,
  label: string,
  side: "left" | "right",
  fns: PinFn[],
  extra: Partial<LabPin> = {},
): LabPin {
  return { id, label, side, fns, ...extra };
}

export const vout = (
  id: string,
  label: string,
  volts: number,
  side: "left" | "right" = L,
): LabPin => ({
  id,
  label,
  side,
  fns: ["power"],
  supplies: volts,
  note: `${volts} V out`,
});

export const gnd = (id: string, side: "left" | "right" = L, label = "GND"): LabPin => ({
  id,
  label,
  side,
  fns: ["ground"],
  note: "Ground",
});

export function pp(
  id: string,
  label: string,
  role: PinRole,
  required = role !== "opt" && role !== "load",
  note?: string,
): LabPin {
  return { id, label, side: L, role, required, note };
}

// ----- peripherals -------------------------------------------------------------

export function peripheral(
  partId: string,
  logic: number,
  supply: [number, number],
  pins: LabPin[],
  tolerates5V = logic >= 5,
): Pinout {
  return { partId, controller: false, logic, supply, tolerates5V, pins };
}
