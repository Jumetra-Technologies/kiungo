import { getPart } from "../../parts";
import type { LabPin, Pinout } from "../pinout";
import type { LabNode, LabWire, PinRef } from "../types";
import { pinKey, type Fault, type Net, type NetKind } from "./types";

export class DisjointSet {
  private parent = new Map<string, string>();
  add(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }
  find(key: string): string {
    let root = this.parent.get(key) ?? key;
    while (root !== (this.parent.get(root) ?? root)) root = this.parent.get(root) ?? root;
    let cur = key;
    while (cur !== root) {
      const next = this.parent.get(cur) ?? root;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function nameOf(node: LabNode) {
  return node.label || getPart(node.partId)?.name || node.partId;
}

/** A board's ground pins are one net; so are its pins on the same supply. */
function joinBoardRails(set: DisjointSet, node: LabNode, pinout: Pinout) {
  const grounds = pinout.pins.filter((p) => p.fns?.includes("ground"));
  const [ground, ...otherGrounds] = grounds;
  if (ground)
    for (const g of otherGrounds) set.union(`${node.id}:${ground.id}`, `${node.id}:${g.id}`);
  const bySupply = new Map<number, LabPin[]>();
  for (const p of pinout.pins)
    if (p.supplies) bySupply.set(p.supplies, [...(bySupply.get(p.supplies) ?? []), p]);
  for (const [head, ...rest] of bySupply.values())
    if (head) for (const p of rest) set.union(`${node.id}:${head.id}`, `${node.id}:${p.id}`);
}

/** Joins pins into nets: each board's own rails, breadboard strips, then the wires. */
export function joinPins(
  nodes: LabNode[],
  wires: LabWire[],
  pinouts: Map<string, Pinout>,
): { set: DisjointSet; validWires: LabWire[] } {
  const set = new DisjointSet();

  // Every pin starts as its own net.
  for (const node of nodes)
    for (const pin of pinouts.get(node.id)!.pins) set.add(`${node.id}:${pin.id}`);

  for (const node of nodes) {
    const pinout = pinouts.get(node.id)!;
    if (pinout.controller) joinBoardRails(set, node, pinout);
  }

  // A breadboard's strips: every hole on one clip is one net.
  for (const node of nodes) {
    for (const strip of pinouts.get(node.id)!.strips ?? [])
      for (let i = 1; i < strip.length; i++)
        set.union(`${node.id}:${strip[0]}`, `${node.id}:${strip[i]}`);
  }

  const ids = new Set(nodes.map((n) => n.id));
  const validWires: LabWire[] = [];
  for (const wire of wires) {
    const a = pinKey(wire.from);
    const b = pinKey(wire.to);
    if (!ids.has(wire.from.node) || !ids.has(wire.to.node)) continue;
    set.add(a);
    set.add(b);
    set.union(a, b);
    validWires.push(wire);
  }
  return { set, validWires };
}

/** What the circuit's helpers need to read pins. */
export interface PinLookup {
  pinOf: (ref: PinRef) => LabPin | undefined;
  isBoard: (id: string) => boolean;
  isPassive: (id: string) => boolean;
}

function kindOf(supplies: Set<number>, grounded: boolean, wireCount: number): NetKind {
  if (supplies.size && grounded) return "short";
  if (supplies.size > 1) return "conflict";
  if (supplies.size) return "power";
  if (grounded) return "ground";
  return wireCount ? "signal" : "open";
}

function netLabel(kind: NetKind, voltage: number | undefined, first: LabPin | undefined): string {
  if (kind === "power" || kind === "conflict") return `${voltage} V rail`;
  if (kind === "ground") return "GND";
  if (kind === "short") return "Short";
  return (first?.label ?? "net").split(" ")[0] ?? "";
}

/** The faults a net has on its own: a short, two supplies, two outputs. */
function netFaults(
  net: Net,
  supplies: Set<number>,
  lookup: PinLookup,
  byId: Map<string, LabNode>,
): Fault[] {
  const { kind, voltage, pins: members, wires: netWires } = net;
  const { pinOf, isBoard } = lookup;
  const faults: Fault[] = [];
  if (kind === "short" && netWires.length) {
    const boards = [...new Set(members.filter((m) => isBoard(m.node)).map((m) => m.node))];
    faults.push({
      id: `short:${boards.join(",")}:${netWires.slice().sort().join(",")}`,
      severity: "error",
      title: "Short circuit: power wired straight to ground",
      detail: `A ${voltage} V supply and GND are joined. A real board would brown out or burn its regulator. Remove the wire that joins them.`,
      nodes: [...new Set(members.map((m) => m.node))],
      wires: netWires,
    });
  }
  if (kind === "conflict" && netWires.length) {
    faults.push({
      id: `conflict:${netWires.slice().sort().join(",")}`,
      severity: "error",
      title: "Two different supplies joined",
      detail: `${[...supplies].sort().join(" V and ")} V rails are wired together. Each part should take one supply.`,
      nodes: [...new Set(members.map((m) => m.node))],
      wires: netWires,
    });
  }

  // Two parts driving one net.
  const drivers = members.filter((ref) => {
    const pin = pinOf(ref);
    return !isBoard(ref.node) && (pin?.role === "out-digital" || pin?.role === "out-analog");
  });
  if (drivers.length > 1) {
    faults.push({
      id: `contention:${drivers.map(pinKey).sort().join(",")}`,
      severity: "warning",
      title: "Two outputs on one wire",
      detail: `${drivers.map((d) => `${nameOf(byId.get(d.node)!)} ${pinOf(d)?.label}`).join(" and ")} both drive the same net, so the board can't tell their signals apart.`,
      nodes: [...new Set(drivers.map((d) => d.node))],
      wires: netWires,
    });
  }
  return faults;
}

/** One net from the pins that share a root: its kind, supply voltage and label. */
function makeNet(id: string, members: PinRef[], netWires: string[], lookup: PinLookup) {
  const { pinOf, isBoard, isPassive } = lookup;
  const supplies = new Set<number>();
  let grounded = false;
  for (const ref of members) {
    const pin = pinOf(ref);
    if (!pin || !isBoard(ref.node)) continue;
    if (pin.supplies) supplies.add(pin.supplies);
    if (pin.fns?.includes("ground")) grounded = true;
  }
  const kind = kindOf(supplies, grounded, netWires.length);
  const voltage = supplies.size ? Math.max(...supplies) : undefined;
  const boardSignal = members.find(
    (ref) => isBoard(ref.node) && !pinOf(ref)?.supplies && !pinOf(ref)?.fns?.includes("ground"),
  );
  const named = members.find((ref) => !isPassive(ref.node)) ?? members[0];
  const first = boardSignal ? pinOf(boardSignal) : named ? pinOf(named) : undefined;
  const label = netLabel(kind, voltage, first);
  const net: Net = { id, pins: members, wires: netWires, kind, voltage, label };
  return { net, supplies };
}

/** The nets, which net each pin and wire is on, and the faults the nets have on their own. */
export function collectNets(
  nodes: LabNode[],
  pinouts: Map<string, Pinout>,
  joined: { set: DisjointSet; validWires: LabWire[] },
  lookup: PinLookup,
): { nets: Net[]; netOfPin: Map<string, string>; netOfWire: Map<string, string>; faults: Fault[] } {
  const { set, validWires } = joined;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = new Map<string, PinRef[]>();
  for (const node of nodes) {
    for (const pin of pinouts.get(node.id)!.pins) {
      const root = set.find(`${node.id}:${pin.id}`);
      groups.set(root, [...(groups.get(root) ?? []), { node: node.id, pin: pin.id }]);
    }
  }
  const wiresOfRoot = new Map<string, string[]>();
  for (const wire of validWires) {
    const root = set.find(pinKey(wire.from));
    wiresOfRoot.set(root, [...(wiresOfRoot.get(root) ?? []), wire.id]);
  }

  const nets: Net[] = [];
  const netOfPin = new Map<string, string>();
  const netOfWire = new Map<string, string>();
  const faults: Fault[] = [];
  let netIndex = 0;
  for (const [root, members] of groups) {
    const { net, supplies } = makeNet(
      `net${netIndex++}`,
      members,
      wiresOfRoot.get(root) ?? [],
      lookup,
    );
    nets.push(net);
    for (const ref of members) netOfPin.set(pinKey(ref), net.id);
    for (const w of net.wires) netOfWire.set(w, net.id);
    faults.push(...netFaults(net, supplies, lookup, byId));
  }
  return { nets, netOfPin, netOfWire, faults };
}
