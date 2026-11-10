import { getPinout, type LabPin, type PinFn, type Pinout } from "./pinout";
import type { LabNode, LabWire } from "./types";

/** What choosing a board pin for one of a part's pins needs to know. */
export interface PinPicker {
  part: LabNode;
  /** The part's own pins. */
  pinout: Pinout;
  board: LabNode;
  /** The board's pins. */
  bp: Pinout;
  wires: LabWire[];
  /** The board's side the part is on. */
  facing: "left" | "right";
  /** A signal pin with no wire yet, and not chosen for another of this part's pins. */
  free: (p: LabPin) => boolean;
  /** Whether a board pin also serves a bus (I²C, SPI, serial, chip select). */
  hasBus: (p: LabPin) => boolean;
  /** The best of some candidates: pins on the side facing the part first. */
  choose: (cands: LabPin[]) => LabPin | undefined;
}

const BUS_FNS = ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"];

export function pinPicker(
  part: LabNode,
  board: LabNode,
  wires: LabWire[],
  claimed: { used: Set<string>; taken: Set<string> },
): PinPicker {
  const facing = part.x >= board.x ? "right" : "left";
  const plain = (p: LabPin) => !p.supplies && !p.fns?.includes("ground");
  return {
    part,
    pinout: getPinout(part.partId),
    board,
    bp: getPinout(board.partId),
    wires,
    facing,
    free: (p) => plain(p) && !claimed.used.has(p.id) && !claimed.taken.has(p.id),
    hasBus: (p) => (p.fns ?? []).some((f) => BUS_FNS.includes(f)),
    // Pins on the side facing the part first, so wires don't wrap round the board.
    choose: (cands) =>
      [...cands].sort((a, b) => Number(b.side === facing) - Number(a.side === facing))[0],
  };
}

function supplyPin({ pinout, bp, facing, part }: PinPicker): LabPin | undefined {
  const [min, max] = pinout.supply ?? [3, 5.5];
  // Rails on the side facing the part first, so wires don't wrap round the board.
  const rails = bp.pins
    .filter((p) => p.supplies)
    .sort((a, b) => Number(b.side === facing) - Number(a.side === facing));
  const fits = rails.filter((p) => p.supplies! >= min - 0.2 && p.supplies! <= max + 0.25);
  // A motor's supply goes on VIN: on the bench that's the barrel jack's battery, not the board's regulator or USB.
  if (part.partId === "dc-motor") {
    const vin = fits.find((p) => p.id === "VIN");
    if (vin) return vin;
  }
  const preferV = fits.some((p) => p.supplies === bp.logic) ? bp.logic : undefined;
  return (
    (preferV ? fits.find((p) => p.supplies === preferV && p.id !== "VIN") : undefined) ??
    fits.find((p) => p.id !== "VIN") ??
    fits[0] ??
    rails.find((p) => p.supplies === Math.min(...rails.map((r) => r.supplies!)))
  );
}

function groundPin({ bp, wires, board, facing }: PinPicker): LabPin | undefined {
  const grounds = bp.pins.filter((p) => p.fns?.includes("ground"));
  const count = (id: string) =>
    wires.filter(
      (w) =>
        (w.from.node === board.id && w.from.pin === id) ||
        (w.to.node === board.id && w.to.pin === id),
    ).length;
  // Prefer the ground on the side facing the part, then the least used.
  return [...grounds].sort(
    (a, b) => Number(b.side === facing) - Number(a.side === facing) || count(a.id) - count(b.id),
  )[0];
}

function drivePin({ part, bp, free, hasBus, choose }: PinPicker): LabPin | undefined {
  const output = (p: LabPin) => free(p) && !p.inputOnly && p.fns?.includes("digital");
  return (
    (part.partId === "led"
      ? bp.pins.find((p) => p.fns?.includes("led") && free(p) && !p.inputOnly)
      : undefined) ??
    choose(bp.pins.filter((p) => output(p) && !hasBus(p) && !p.fns?.includes("analog"))) ??
    choose(bp.pins.filter((p) => output(p) && !hasBus(p))) ??
    choose(bp.pins.filter((p) => output(p)))
  );
}

function pwmPin({ bp, free, hasBus, choose }: PinPicker): LabPin | undefined {
  const ok = (p: LabPin) => free(p) && !p.inputOnly;
  return (
    choose(bp.pins.filter((p) => ok(p) && p.fns?.includes("pwm") && !hasBus(p))) ??
    choose(bp.pins.filter((p) => ok(p) && p.fns?.includes("pwm"))) ??
    choose(bp.pins.filter((p) => ok(p) && p.fns?.includes("digital")))
  );
}

function analogPin({ bp, free, hasBus, choose }: PinPicker): LabPin | undefined {
  return (
    choose(bp.pins.filter((p) => free(p) && p.fns?.includes("analog") && !hasBus(p))) ??
    choose(bp.pins.filter((p) => free(p) && p.fns?.includes("analog"))) ??
    // No analog pins (Raspberry Pi): land on a GPIO; the analysis explains the ADC it needs.
    choose(bp.pins.filter((p) => free(p) && p.fns?.includes("digital") && !hasBus(p)))
  );
}

function digitalPin(k: PinPicker, pin: LabPin): LabPin | undefined {
  const { bp, free, hasBus, choose } = k;
  // Input-only pins suit a part's output but not two-way data; try them last either way.
  const ok = (p: LabPin) =>
    free(p) && p.fns?.includes("digital") && (pin.role === "out-digital" || !p.inputOnly);
  const byInputOnly = (list: LabPin[]) =>
    [...list].sort((a, b) => Number(!!a.inputOnly) - Number(!!b.inputOnly));
  const pick = (when: (p: LabPin) => boolean | undefined) =>
    choose(byInputOnly(bp.pins.filter((p) => ok(p) && when(p))));
  return (
    pick((p) => !hasBus(p) && !p.fns?.includes("analog") && !p.fns?.includes("led")) ??
    pick((p) => !hasBus(p) && !p.fns?.includes("led")) ??
    pick((p) => !hasBus(p)) ??
    pick(() => true)
  );
}

/** A plain GPIO the board can drive, for serial or chip select when no dedicated pin is free. */
function gpioPin({ bp, free, hasBus, choose }: PinPicker): LabPin | undefined {
  return choose(
    bp.pins.filter((p) => free(p) && p.fns?.includes("digital") && !hasBus(p) && !p.inputOnly),
  );
}

/** The part's TX goes to a board RX; pin 0 (USB serial) last. */
function txPin(k: PinPicker): LabPin | undefined {
  const rxs = k.bp.pins.filter((p) => p.fns?.includes("rx") && k.free(p));
  return rxs.find((p) => !/^(D0|RX|0)$/.test(p.id)) ?? rxs[0] ?? gpioPin(k);
}

/** The part's RX comes from a board TX; pin 1 (USB serial) last. */
function rxPin(k: PinPicker): LabPin | undefined {
  const txs = k.bp.pins.filter((p) => p.fns?.includes("tx") && k.free(p));
  return txs.find((p) => !/^(D1|TX|1)$/.test(p.id)) ?? txs[0] ?? gpioPin(k);
}

function csPin(k: PinPicker): LabPin | undefined {
  return k.bp.pins.find((p) => p.fns?.includes("cs") && k.free(p)) ?? gpioPin(k);
}

const busPin = (k: PinPicker, pin: LabPin) =>
  k.bp.pins.find((p) => p.fns?.includes(pin.role as PinFn));

const BY_ROLE = new Map<string, (k: PinPicker, pin: LabPin) => LabPin | undefined>([
  ["vcc", supplyPin],
  ["gnd", groundPin],
  ["drive", drivePin],
  ["pwm", pwmPin],
  ["out-analog", analogPin],
  ["out-digital", digitalPin],
  ["io", digitalPin],
  ["sda", busPin],
  ["scl", busPin],
  ["mosi", busPin],
  ["miso", busPin],
  ["sck", busPin],
  ["tx", txPin],
  ["rx", rxPin],
  ["cs", csPin],
]);

/** The board pin a part's pin should go to, or undefined when the board has none free for it. */
export function boardPinFor(k: PinPicker, pin: LabPin): LabPin | undefined {
  const pick = pin.role ? BY_ROLE.get(pin.role) : undefined;
  return pick ? pick(k, pin) : undefined;
}
