/**
 * What a breadboard on the canvas is doing: which of its strips are in use,
 * what each carries and which parts hang off it. Drives the breadboard's
 * Live panel and its Strips list in the Inspector.
 */

import { RAILS, breadboardSpec, stripName, type RailId } from "../parts/models/breadboard";
import type { Analysis, NetKind } from "./circuit";
import { getPinout } from "./pinout";
import type { LabNode } from "./types";

export interface StripUse {
  /** First hole of the strip, a stable key. */
  id: string;
  name: string;
  rail?: RailId;
  kind: NetKind;
  /** "5 V rail", "GND", "D13". */
  net: string;
  /** Holes on this strip with a wire in them. */
  holes: string[];
  /** Other parts' pins on the same net: "DHT11 VCC", "Uno 5V". */
  ends: string[];
}

/** Strips with a wire, rails first. */
export function breadboardUse(nodeId: string, analysis: Analysis, nodes: LabNode[]): StripUse[] {
  const wired = analysis.nodes[nodeId]?.wiredPins ?? new Set<string>();
  const nets = new Map(analysis.nets.map((n) => [n.id, n]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const spec = breadboardSpec(byId.get(nodeId)?.partId ?? "");
  if (!spec) return [];
  const hole0 = new Map(spec.holes.map((h) => [h.id, h]));
  const out: StripUse[] = [];
  for (const strip of spec.strips) {
    const holes = strip.filter((h) => wired.has(h));
    if (!holes.length) continue;
    const net = nets.get(analysis.netOfPin.get(`${nodeId}:${strip[0]}`) ?? "");
    if (!net) continue;
    const hole = hole0.get(strip[0])!;
    const ends = net.pins
      .filter((p) => p.node !== nodeId && analysis.nodes[p.node]?.wiredPins.has(p.pin))
      .map((p) => {
        const n = byId.get(p.node);
        const pin = n ? getPinout(n.partId).pins.find((x) => x.id === p.pin) : undefined;
        return `${n?.label ?? p.node} ${pin?.label ?? p.pin}`;
      });
    out.push({ id: strip[0], name: stripName(hole.strip), rail: hole.rail, kind: net.kind, net: net.label, holes, ends });
  }
  return out.sort((a, b) => Number(!a.rail) - Number(!b.rail));
}

/** One line for the canvas badge: what the rails carry. */
export function railSummary(use: StripUse[]): string | undefined {
  const rails = use.filter((u) => u.rail);
  const supply = rails.find((u) => u.kind === "power" && RAILS[u.rail!].sign === "+");
  const ground = rails.some((u) => u.kind === "ground");
  if (supply && ground) return `${supply.net.replace(" rail", "")} · GND`;
  if (supply) return supply.net.replace(" rail", "");
  if (ground) return "GND only";
  return undefined;
}
