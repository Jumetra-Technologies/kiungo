/**
 * Auto-wiring and placement: what the lab does when a part is added with one
 * click. A peripheral is wired to the board the way a tutorial would: supply,
 * ground, and each signal on a free pin that can do the job.
 */

import { breadboardSpec, type BreadboardSpec, type RailId } from "../parts/models/breadboard";
import { analyze, type Analysis } from "./circuit";
import { nodeFootprint } from "./layout";
import { getPinout, type LabPin, type PinFn, type Pinout } from "./pinout";
import type { LabNode, LabWire, PinRef } from "./types";

export interface PlannedWire {
  from: PinRef;
  to: PinRef;
}

export interface WirePlan {
  board: LabNode | null;
  wires: PlannedWire[];
  skipped: string[];
  /** Wires to take out first: the direct pin-to-LED wire a new resistor goes in place of. */
  remove?: string[];
}

/** Board pins already carrying a wire. Power and ground can be shared. */
function usedPins(boardId: string, wires: LabWire[]): Set<string> {
  const used = new Set<string>();
  for (const w of wires) {
    if (w.from.node === boardId) used.add(w.from.pin);
    if (w.to.node === boardId) used.add(w.to.pin);
  }
  return used;
}

const SHARED_BUS: PinFn[] = ["sda", "scl", "mosi", "miso", "sck"];

function pickBoard(nodes: LabNode[], wires: LabWire[], prefer?: string): LabNode | null {
  const boards = nodes.filter((n) => getPinout(n.partId).controller);
  if (!boards.length) return null;
  if (prefer) {
    const chosen = boards.find((b) => b.id === prefer);
    if (chosen) return chosen;
  }
  // The board with most free signal pins.
  return [...boards].sort((a, b) => {
    const free = (n: LabNode) =>
      getPinout(n.partId).pins.filter(
        (p) => !p.supplies && !p.fns?.includes("ground") && !usedPins(n.id, wires).has(p.id),
      ).length;
    return free(b) - free(a);
  })[0];
}

/** Wires already in a breadboard hole. */
function usedHoles(nodeId: string, wires: LabWire[]): Set<string> {
  return usedPins(nodeId, wires);
}

/** Holes of a rail, starting from the end nearer `towardsX` (canvas x), so wires stay short. */
function railHoles(spec: BreadboardSpec, rail: RailId, fromRight: boolean): string[] {
  const all = Array.from({ length: spec.railHoles }, (_, i) => `${rail}${i + 1}`);
  return fromRight ? all.reverse() : all;
}

/**
 * A breadboard added to a build with a board: the board's supply goes to the
 * top + rail and its GND to the top − rail, with one wire each, so every part
 * after it can take power from the rails.
 */
function planBreadboard(
  breadboard: LabNode,
  nodes: LabNode[],
  wires: LabWire[],
  preferBoard?: string,
): { board: LabNode | null; wires: PlannedWire[]; skipped: string[] } {
  const board = pickBoard(
    nodes.filter((n) => n.id !== breadboard.id),
    wires,
    preferBoard,
  );
  if (!board) return { board: null, wires: [], skipped: [] };
  const spec = breadboardSpec(breadboard.partId);
  // A mini board has no rails: nothing to feed until the student picks strips.
  if (!spec?.rails.TP || !spec.rails.TN) return { board, wires: [], skipped: [] };
  const bp = getPinout(board.partId);
  const used = usedHoles(breadboard.id, wires);
  const fromRight = board.x > breadboard.x;
  const planned: PlannedWire[] = [];
  const skipped: string[] = [];
  const supply =
    bp.pins.find((p) => p.supplies === bp.logic && p.id !== "VIN") ??
    bp.pins.find((p) => p.supplies);
  const ground = bp.pins.find((p) => p.fns?.includes("ground"));
  for (const [rail, pin] of [
    ["TP", supply],
    ["TN", ground],
  ] as const) {
    const holes = railHoles(spec, rail, fromRight);
    if (holes.some((h) => used.has(h))) continue; // Already fed.
    if (!pin) {
      skipped.push(`${spec.rails[rail]!.label} rail`);
      continue;
    }
    planned.push({
      from: { node: board.id, pin: pin.id },
      to: { node: breadboard.id, pin: holes[0] },
    });
  }
  return { board, wires: planned, skipped };
}

/**
 * A new resistor goes where a real build needs it: between a board pin and
 * the anode of an LED wired straight to that pin. The direct wire comes out;
 * pin → leg 1 and leg 2 → anode go in. With no such LED it stays unwired.
 */
function planResistor(
  resistor: LabNode,
  nodes: LabNode[],
  wires: LabWire[],
  preferBoard?: string,
): WirePlan {
  const board = pickBoard(
    nodes.filter((n) => n.id !== resistor.id),
    wires,
    preferBoard,
  );
  if (!board) return { board: null, wires: [], skipped: [] };
  const isBoardNode = (id: string) =>
    getPinout(nodes.find((n) => n.id === id)?.partId ?? "").controller;
  for (const led of nodes.filter((n) => n.partId === "led")) {
    const direct = wires.find(
      (w) =>
        (w.to.node === led.id && w.to.pin === "A" && isBoardNode(w.from.node)) ||
        (w.from.node === led.id && w.from.pin === "A" && isBoardNode(w.to.node)),
    );
    if (!direct) continue;
    const pin = direct.to.node === led.id ? direct.from : direct.to;
    return {
      board: nodes.find((n) => n.id === pin.node) ?? board,
      wires: [
        { from: pin, to: { node: resistor.id, pin: "1" } },
        { from: { node: led.id, pin: "A" }, to: { node: resistor.id, pin: "2" } },
      ],
      skipped: [],
      remove: [direct.id],
    };
  }
  return { board, wires: [], skipped: [] };
}

/**
 * A free hole on a breadboard rail that already carries what a pin needs:
 * `volts` on a + rail, or this board's ground on a − rail. Null when no
 * breadboard has one, and the pin then goes to the board directly.
 */
function railHole(
  want: { kind: "power"; volts: number } | { kind: "ground" },
  board: LabNode,
  part: LabNode,
  nodes: LabNode[],
  wires: LabWire[],
  analysis: Analysis,
  taken: Set<string>,
): PinRef | null {
  const boardGround = getPinout(board.partId).pins.find((p) => p.fns?.includes("ground"));
  const groundNet = boardGround
    ? analysis.netOfPin.get(`${board.id}:${boardGround.id}`)
    : undefined;
  for (const bb of nodes.filter((n) => getPinout(n.partId).strips)) {
    const spec = breadboardSpec(bb.partId);
    if (!spec) continue;
    const used = usedHoles(bb.id, wires);
    const rails = (Object.keys(spec.rails) as RailId[]).filter((r) =>
      want.kind === "power" ? spec.rails[r]!.sign === "+" : spec.rails[r]!.sign === "−",
    );
    for (const rail of rails) {
      const netId = analysis.netOfPin.get(`${bb.id}:${rail}1`);
      const net = analysis.nets.find((n) => n.id === netId);
      if (!net) continue;
      const ok =
        want.kind === "power"
          ? net.kind === "power" &&
            net.voltage === want.volts &&
            net.pins.some((p) => p.node === board.id)
          : net.kind === "ground" && netId === groundNet;
      if (!ok) continue;
      const hole = railHoles(spec, rail, part.x > bb.x + nodeFootprint(bb.partId).w / 2).find(
        (h) => !used.has(h) && !taken.has(`${bb.id}:${h}`),
      );
      if (hole) {
        taken.add(`${bb.id}:${hole}`);
        return { node: bb.id, pin: hole };
      }
    }
  }
  return null;
}

export function planAutoWire(
  part: LabNode,
  nodes: LabNode[],
  wires: LabWire[],
  preferBoard?: string,
): WirePlan {
  const pinout = getPinout(part.partId);
  if (pinout.controller) return { board: null, wires: [], skipped: [] };
  if (pinout.strips) return planBreadboard(part, nodes, wires, preferBoard);
  if (part.partId === "resistor") return planResistor(part, nodes, wires, preferBoard);
  const board = pickBoard(
    nodes.filter((n) => n.id !== part.id),
    wires,
    preferBoard,
  );
  if (!board) return { board: null, wires: [], skipped: [] };
  const bp: Pinout = getPinout(board.partId);
  const used = usedPins(board.id, wires);
  const taken = new Set<string>();
  const planned: PlannedWire[] = [];
  const skipped: string[] = [];

  const facing = part.x >= board.x ? "right" : "left";
  const plain = (p: LabPin) => !p.supplies && !p.fns?.includes("ground");
  const free = (p: LabPin) => plain(p) && !used.has(p.id) && !taken.has(p.id);
  const hasBus = (p: LabPin) =>
    (p.fns ?? []).some((f) => ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"].includes(f));
  // Pins on the side facing the part first, so wires don't wrap round the board.
  const choose = (cands: LabPin[]) =>
    [...cands].sort((a, b) => Number(b.side === facing) - Number(a.side === facing))[0];

  const supplyPin = (): LabPin | undefined => {
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
  };
  const groundPin = (): LabPin | undefined => {
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
  };

  // With a breadboard fed by this board, supply and ground come from its rails, as on the bench.
  const analysis = nodes.some((n) => getPinout(n.partId).strips) ? analyze(nodes, wires) : null;
  const takenHoles = new Set<string>();

  const signalOrder = pinout.pins.filter((p) => p.role && !["opt", "load"].includes(p.role));
  // Of "any of" groups (soil A0/D0, RGB, motor IN/EN) wire the useful ones.
  const wanted = signalOrder.filter((p) => {
    if (p.required) return true;
    if (part.partId === "soil-moisture" || part.partId === "mq2") return p.id === "A0";
    if (part.partId === "rgb-led" || part.partId === "dc-motor") return true;
    return false;
  });

  for (const pin of wanted) {
    let target: LabPin | undefined;
    switch (pin.role) {
      case "vcc":
        target = supplyPin();
        break;
      case "gnd":
        target = groundPin();
        break;
      case "drive":
        target =
          (part.partId === "led"
            ? bp.pins.find((p) => p.fns?.includes("led") && free(p) && !p.inputOnly)
            : undefined) ??
          choose(
            bp.pins.filter(
              (p) =>
                free(p) &&
                !p.inputOnly &&
                p.fns?.includes("digital") &&
                !hasBus(p) &&
                !p.fns?.includes("analog"),
            ),
          ) ??
          choose(
            bp.pins.filter(
              (p) => free(p) && !p.inputOnly && p.fns?.includes("digital") && !hasBus(p),
            ),
          ) ??
          choose(bp.pins.filter((p) => free(p) && !p.inputOnly && p.fns?.includes("digital")));
        break;
      case "pwm":
        target =
          choose(
            bp.pins.filter((p) => free(p) && !p.inputOnly && p.fns?.includes("pwm") && !hasBus(p)),
          ) ??
          choose(bp.pins.filter((p) => free(p) && !p.inputOnly && p.fns?.includes("pwm"))) ??
          choose(bp.pins.filter((p) => free(p) && !p.inputOnly && p.fns?.includes("digital")));
        break;
      case "out-analog":
        target =
          choose(bp.pins.filter((p) => free(p) && p.fns?.includes("analog") && !hasBus(p))) ??
          choose(bp.pins.filter((p) => free(p) && p.fns?.includes("analog"))) ??
          // No analog pins (Raspberry Pi): land on a GPIO; the analysis explains the ADC it needs.
          choose(bp.pins.filter((p) => free(p) && p.fns?.includes("digital") && !hasBus(p)));
        break;
      case "out-digital":
      case "io": {
        // Input-only pins suit a part's output but not two-way data; try them last either way.
        const ok = (p: LabPin) =>
          free(p) && p.fns?.includes("digital") && (pin.role === "out-digital" || !p.inputOnly);
        const byInputOnly = (list: LabPin[]) =>
          [...list].sort((a, b) => Number(!!a.inputOnly) - Number(!!b.inputOnly));
        target =
          choose(
            byInputOnly(
              bp.pins.filter(
                (p) => ok(p) && !hasBus(p) && !p.fns?.includes("analog") && !p.fns?.includes("led"),
              ),
            ),
          ) ??
          choose(
            byInputOnly(bp.pins.filter((p) => ok(p) && !hasBus(p) && !p.fns?.includes("led"))),
          ) ??
          choose(byInputOnly(bp.pins.filter((p) => ok(p) && !hasBus(p)))) ??
          choose(byInputOnly(bp.pins.filter((p) => ok(p))));
        break;
      }
      case "sda":
      case "scl":
      case "mosi":
      case "miso":
      case "sck":
        target = bp.pins.find((p) => p.fns?.includes(pin.role as PinFn));
        break;
      case "tx": {
        const rxs = bp.pins.filter((p) => p.fns?.includes("rx") && free(p));
        target =
          rxs.find((p) => !/^(D0|RX|0)$/.test(p.id)) ??
          rxs[0] ??
          choose(
            bp.pins.filter(
              (p) => free(p) && p.fns?.includes("digital") && !hasBus(p) && !p.inputOnly,
            ),
          );
        break;
      }
      case "rx": {
        const txs = bp.pins.filter((p) => p.fns?.includes("tx") && free(p));
        target =
          txs.find((p) => !/^(D1|TX|1)$/.test(p.id)) ??
          txs[0] ??
          choose(
            bp.pins.filter(
              (p) => free(p) && p.fns?.includes("digital") && !hasBus(p) && !p.inputOnly,
            ),
          );
        break;
      }
      case "cs":
        target =
          bp.pins.find((p) => p.fns?.includes("cs") && free(p)) ??
          choose(
            bp.pins.filter(
              (p) => free(p) && !p.inputOnly && p.fns?.includes("digital") && !hasBus(p),
            ),
          );
        break;
      default:
        break;
    }
    if (!target) {
      skipped.push(pin.label);
      continue;
    }
    if (analysis && (pin.role === "vcc" || pin.role === "gnd")) {
      const hole = railHole(
        pin.role === "vcc"
          ? { kind: "power", volts: target.supplies ?? bp.logic }
          : { kind: "ground" },
        board,
        part,
        nodes,
        wires,
        analysis,
        takenHoles,
      );
      if (hole) {
        planned.push({ from: hole, to: { node: part.id, pin: pin.id } });
        continue;
      }
    }
    if (plain(target) && !SHARED_BUS.some((f) => target!.fns?.includes(f))) taken.add(target.id);
    planned.push({ from: { node: board.id, pin: target.id }, to: { node: part.id, pin: pin.id } });
  }
  return { board, wires: planned, skipped };
}

/** Node footprint on the canvas, for placement (matches the node renderer). */
export function nodeBox(partId: string): { w: number; h: number } {
  return nodeFootprint(partId);
}

/** A free spot: right of the board for peripherals, in rows; boards stack to the left. */
export function placeNode(
  partId: string,
  nodes: LabNode[],
  anchor?: LabNode | null,
): { x: number; y: number } {
  const box = nodeBox(partId);
  const overlaps = (x: number, y: number) =>
    nodes.some((n) => {
      const b = nodeBox(n.partId);
      return (
        x < n.x + b.w + 32 && x + box.w + 32 > n.x && y < n.y + b.h + 24 && y + box.h + 24 > n.y
      );
    });
  if (!nodes.length) return { x: 80, y: 80 };
  const isBoard = getPinout(partId).controller;
  const origin = anchor ?? nodes[0];
  const ob = nodeBox(origin.partId);
  const startX = isBoard ? origin.x : origin.x + ob.w + 120;
  const startY = origin.y;
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      const x = isBoard ? startX - col * 0 : startX + col * (box.w + 60);
      const y = isBoard ? startY + (row + 1) * (ob.h + 60) : startY + row * 40;
      if (!overlaps(x, y)) return { x, y };
    }
  }
  const maxY = Math.max(...nodes.map((n) => n.y + nodeBox(n.partId).h));
  return { x: origin.x, y: maxY + 60 };
}
