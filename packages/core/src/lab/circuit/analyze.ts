/**
 * Circuit analysis for the Engineering Lab.
 *
 * Joins pins into nets through the wires (and through each board's own
 * rails), works out which nets carry a supply, which are ground and which
 * carry signals, then checks every part against what its pins expect. The
 * result drives the Current flow view, the fault list and the simulation.
 */

import { getPinout, type Pinout } from "../pinout";
import type { LabNode, LabWire, NodeInputs, PinRef } from "../types";
import { checkCommonGround, linkBoards, reportBoards, reportBreadboards } from "./boards";
import type { Circuit } from "./context";
import { collectNets, joinPins, type PinLookup } from "./nets";
import { reportPeripherals } from "./peripherals";
import type { Analysis, Fault, NodeReport, Severity } from "./types";

function lookupFor(pinouts: Map<string, Pinout>): PinLookup {
  return {
    pinOf: (ref: PinRef) => pinouts.get(ref.node)?.pins.find((p) => p.id === ref.pin),
    isBoard: (id: string) => pinouts.get(id)?.controller ?? false,
    isPassive: (id: string) => pinouts.get(id)?.passive ?? false,
  };
}

function wiredPinsOf(wires: LabWire[]): Map<string, Set<string>> {
  const wiredPins = new Map<string, Set<string>>();
  for (const wire of wires) {
    for (const end of [wire.from, wire.to]) {
      wiredPins.set(end.node, (wiredPins.get(end.node) ?? new Set()).add(end.pin));
    }
  }
  return wiredPins;
}

/** Attach net-level faults to the nodes they touch. */
function attachFaults(faults: Fault[], reports: Record<string, NodeReport>) {
  for (const f of faults) {
    for (const id of f.nodes) {
      const report = reports[id];
      if (report && !report.faults.includes(f)) {
        report.faults.push(f);
        if (f.severity === "error") report.status = "fault";
      }
    }
  }
}

/** `inputs` carries the values set on parts; a resistor's is its resistance. */
export function analyze(
  nodes: LabNode[],
  wires: LabWire[],
  inputs?: Record<string, NodeInputs>,
): Analysis {
  const pinouts = new Map<string, Pinout>(nodes.map((n) => [n.id, getPinout(n.partId)]));
  const lookup = lookupFor(pinouts);
  const joined = joinPins(nodes, wires, pinouts);
  const { nets, netOfPin, netOfWire, faults } = collectNets(nodes, pinouts, joined, lookup);
  const c: Circuit = {
    ...lookup,
    nodes,
    inputs,
    byId: new Map(nodes.map((n) => [n.id, n])),
    pinouts,
    nets,
    netOfPin,
    netOfWire,
    netById: new Map(nets.map((n) => [n.id, n])),
    wiredPins: wiredPinsOf(joined.validWires),
    faults,
    reports: {},
    boardLinks: [],
  };

  reportBoards(c);
  linkBoards(c);
  checkCommonGround(c);
  reportBreadboards(c);
  reportPeripherals(c);
  attachFaults(c.faults, c.reports);

  const order: Record<Severity, number> = { error: 0, warning: 1, tip: 2 };
  c.faults.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    nets,
    netOfPin,
    netOfWire,
    nodes: c.reports,
    faults: c.faults,
    boardLinks: c.boardLinks,
  };
}
