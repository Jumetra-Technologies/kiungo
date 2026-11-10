import { breadboardSpec, stripName } from "../../parts/models/breadboard";
import { ohmsOf } from "../controls";
import type { Pinout } from "../pinout";
import type { LabNode, NodeInputs, PinRef } from "../types";
import type { PinLookup } from "./nets";
import { pinKey, type BoardToBoard, type Fault, type Net, type NodeReport } from "./types";

/** Everything the checks share while one circuit is analyzed. */
export interface Circuit extends PinLookup {
  nodes: LabNode[];
  inputs?: Record<string, NodeInputs>;
  byId: Map<string, LabNode>;
  pinouts: Map<string, Pinout>;
  nets: Net[];
  netOfPin: Map<string, string>;
  netOfWire: Map<string, string>;
  netById: Map<string, Net>;
  /** Pins with at least one wire, by node. */
  wiredPins: Map<string, Set<string>>;
  faults: Fault[];
  reports: Record<string, NodeReport>;
  boardLinks: BoardToBoard[];
}

export const netFor = (c: Circuit, ref: PinRef) => c.netById.get(c.netOfPin.get(pinKey(ref)) ?? "");

/**
 * A net that reaches no board pin, supply or ground on its own, followed
 * through one resistor to the net on its other leg: an LED's anode on a
 * resistor whose far leg is on D13 is driven by D13.
 */
export function throughResistor(c: Circuit, net: Net): { net: Net; ohms: number } {
  const reaches =
    net.kind === "power" ||
    net.kind === "ground" ||
    net.kind === "short" ||
    net.pins.some((p) => c.isBoard(p.node));
  if (reaches) return { net, ohms: 0 };
  const leg = net.pins.find((p) => c.byId.get(p.node)?.partId === "resistor");
  if (!leg) return { net, ohms: 0 };
  const other = netFor(c, { node: leg.node, pin: leg.pin === "1" ? "2" : "1" });
  if (!other || other.id === net.id) return { net, ohms: 0 };
  return { net: other, ohms: ohmsOf(c.inputs, leg.node) };
}

/** Where a net passes through a breadboard: "Top + rail", or null. */
export function breadboardStrip(c: Circuit, net: Net): string | null {
  const hole = net.pins.find((ref) => !!c.pinouts.get(ref.node)?.strips);
  if (!hole) return null;
  const h = breadboardSpec(c.byId.get(hole.node)?.partId ?? "")?.holes.find(
    (x) => x.id === hole.pin,
  );
  return h ? stripName(h.strip) : null;
}
