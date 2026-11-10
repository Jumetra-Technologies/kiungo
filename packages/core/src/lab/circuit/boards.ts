import { breadboardSpec, type RailId } from "../../parts/models/breadboard";
import type { Pinout } from "../pinout";
import type { LabNode, PinRef } from "../types";
import { netFor, type Circuit } from "./context";
import { nameOf } from "./nets";
import { pinKey, type BoardToBoard, type Fault, type Net } from "./types";

/** Boards: powered over USB unless a rail is shorted. */
export function reportBoards(c: Circuit) {
  for (const node of c.nodes) {
    const pinout = c.pinouts.get(node.id)!;
    if (!pinout.controller) continue;
    const shorted = c.nets.some(
      (n) =>
        (n.kind === "short" || n.kind === "conflict") &&
        n.pins.some((p) => p.node === node.id) &&
        n.wires.length > 0,
    );
    c.reports[node.id] = {
      status: shorted ? "fault" : "ready",
      powered: !shorted,
      grounded: true,
      supplyV: pinout.logic,
      links: [],
      faults: [],
      wiredPins: c.wiredPins.get(node.id) ?? new Set(),
    };
  }
}

const SPI_FNS = ["mosi", "miso", "sck"];

function busOf(kind: Net["kind"], fa: string[], fb: string[]): BoardToBoard["bus"] {
  if (kind === "power") return "power";
  const uart = (f: string[]) => f.includes("tx") || f.includes("rx");
  const i2c = (f: string[]) => f.includes("sda") || f.includes("scl");
  const spi = (f: string[]) => f.some((x) => SPI_FNS.includes(x));
  if (uart(fa) && uart(fb)) return "uart";
  if (i2c(fa) && i2c(fb)) return "i2c";
  if (spi(fa) && spi(fb)) return "spi";
  return "gpio";
}

interface End {
  ref: PinRef;
  fns: string[];
  label: string | undefined;
  name: string;
  board: Pinout;
}

/** A 5 V board's signal into a board that doesn't take 5 V. */
function levelFault(net: Net, a: End, b: End): Fault | null {
  if (net.kind !== "signal" || a.board.logic === b.board.logic) return null;
  const high = a.board.logic > b.board.logic ? a : b;
  const low = high === a ? b : a;
  if (low.board.tolerates5V === true) return null;
  return {
    id: `level:${pinKey(a.ref)}:${pinKey(b.ref)}`,
    severity: low.board.tolerates5V === "some" ? "warning" : "error",
    title: "5 V signal into a 3.3 V board",
    detail: `${high.name} drives ${high.board.logic} V; ${low.name} pins take 3.3 V. Put a level shifter or a 1 kΩ/2 kΩ divider between them.`,
    nodes: [a.ref.node, b.ref.node],
    wires: net.wires,
  };
}

function uartFault(net: Net, a: End, b: End): Fault | null {
  const { fns: fa } = a;
  const { fns: fb } = b;
  const sameWay =
    (fa.includes("tx") && fb.includes("tx") && !fb.includes("rx")) ||
    (fa.includes("rx") && fb.includes("rx") && !fb.includes("tx"));
  if (!sameWay) return null;
  return {
    id: `uart-cross:${pinKey(a.ref)}:${pinKey(b.ref)}`,
    severity: "error",
    title: `${fa.includes("tx") ? "TX wired to TX" : "RX wired to RX"}`,
    detail: `${a.name} ${a.label} and ${b.name} ${b.label} are the same direction. Cross them: TX goes to RX.`,
    nodes: [a.ref.node, b.ref.node],
    wires: net.wires,
  };
}

function end(c: Circuit, ref: PinRef): End {
  const pin = c.pinOf(ref)!;
  return {
    ref,
    fns: pin.fns ?? [],
    label: pin.label,
    name: nameOf(c.byId.get(ref.node)!),
    board: c.pinouts.get(ref.node)!,
  };
}

function linkPair(c: Circuit, net: Net, refA: PinRef, refB: PinRef) {
  const a = end(c, refA);
  const b = end(c, refB);
  const bus = busOf(net.kind, a.fns, b.fns);
  c.boardLinks.push({ a: refA.node, b: refB.node, aPin: refA.pin, bPin: refB.pin, bus });
  const uart = bus === "uart" ? uartFault(net, a, b) : null;
  if (uart) c.faults.push(uart);
  const level = levelFault(net, a, b);
  if (level) c.faults.push(level);
  // Boards sharing a supply rail is fine; nothing to flag.
}

/** Board-to-board links and their checks. */
export function linkBoards(c: Circuit) {
  for (const net of c.nets) {
    if (net.kind !== "signal" && net.kind !== "power") continue;
    const boardPins = net.pins.filter((ref) => c.isBoard(ref.node));
    for (const [i, a] of boardPins.entries()) {
      for (const b of boardPins.slice(i + 1)) if (a.node !== b.node) linkPair(c, net, a, b);
    }
  }
}

/** Boards that talk need a common ground. */
export function checkCommonGround(c: Circuit) {
  const groundNetOf = (boardId: string) => {
    const pin = c.pinouts.get(boardId)!.pins.find((p) => p.fns?.includes("ground"));
    return pin ? c.netOfPin.get(`${boardId}:${pin.id}`) : undefined;
  };
  const checkedPairs = new Set<string>();
  for (const link of c.boardLinks) {
    if (link.bus === "power") continue;
    const pair = [link.a, link.b].sort().join("|");
    if (checkedPairs.has(pair)) continue;
    checkedPairs.add(pair);
    if (groundNetOf(link.a) !== groundNetOf(link.b)) {
      c.faults.push({
        id: `common-ground:${pair}`,
        severity: "warning",
        title: "No common ground between boards",
        detail: `${nameOf(c.byId.get(link.a)!)} and ${nameOf(c.byId.get(link.b)!)} share a signal but not GND, so neither can read the other's levels reliably. Wire GND to GND.`,
        nodes: [link.a, link.b],
        wires: [],
      });
    }
  }
}

/** A breadboard rail whose printed sign says the opposite of what it carries. */
function railSignFault(node: LabNode, rail: RailId, sign: string, label: string, net: Net) {
  if (sign === "+" && net.kind === "ground") {
    return {
      id: `rail-sign:${node.id}:${rail}`,
      severity: "warning" as const,
      title: `GND on the ${label} rail`,
      detail: `The ${label} rail is printed red for supply, but it is wired to ground. It works, but anyone who trusts the stripes will wire parts backwards. Put GND on a − rail.`,
      nodes: [node.id],
      wires: net.wires,
    };
  }
  if (sign === "−" && net.kind === "power") {
    return {
      id: `rail-sign:${node.id}:${rail}`,
      severity: "warning" as const,
      title: `${net.voltage} V on the ${label} rail`,
      detail: `The ${label} rail is printed blue for ground, but it carries ${net.voltage} V. Put the supply on a + rail and GND on this one, so the stripes tell the truth.`,
      nodes: [node.id],
      wires: net.wires,
    };
  }
  return null;
}

/** The highest supply and whether ground reaches any of the breadboard's holes. */
function breadboardSupply(c: Circuit, node: LabNode, pinout: Pinout) {
  let supplyV: number | null = null;
  let grounded = false;
  const seen = new Set<string>();
  for (const pin of pinout.pins) {
    const net = netFor(c, { node: node.id, pin: pin.id });
    if (!net || seen.has(net.id)) continue;
    seen.add(net.id);
    if (net.kind === "power" && net.voltage !== undefined)
      supplyV = Math.max(supplyV ?? 0, net.voltage);
    if (net.kind === "ground") grounded = true;
  }
  return { supplyV, grounded };
}

/** Breadboards: nothing to power or check, but their rails should carry what they're marked with. */
export function reportBreadboards(c: Circuit) {
  for (const node of c.nodes) {
    const pinout = c.pinouts.get(node.id)!;
    if (!pinout.passive) continue;
    const wired = c.wiredPins.get(node.id) ?? new Set<string>();
    const nodeFaults: Fault[] = [];
    const { supplyV, grounded } = breadboardSupply(c, node, pinout);
    const rails = breadboardSpec(node.partId)?.rails ?? {};
    for (const rail of Object.keys(rails) as RailId[]) {
      const net = netFor(c, { node: node.id, pin: `${rail}1` });
      if (!net || !net.wires.length) continue;
      const { sign, label } = rails[rail]!;
      const fault = railSignFault(node, rail, sign, label, net);
      if (fault) nodeFaults.push(fault);
    }
    c.reports[node.id] = {
      // A breadboard draws no current itself, so it never counts as a load.
      status: wired.size === 0 ? "idle" : "ready",
      powered: false,
      grounded,
      supplyV,
      links: [],
      faults: nodeFaults,
      wiredPins: wired,
    };
    c.faults.push(...nodeFaults);
  }
}
