import type { Analysis } from "../circuit";
import { pinKey } from "../circuit";
import { isSensorPart } from "../controls";
import { getPinout } from "../pinout";
import type { LabNode, LabWire } from "../types";
import type { Frame, WireLive } from "./live";

/** How much current or data each wire carries, from the pin levels of a frame. */
export function wireFlows(
  nodes: LabNode[],
  wires: LabWire[],
  analysis: Analysis,
  pins: Record<string, number>,
  running: boolean,
): Record<string, WireLive> {
  const wireLive: Record<string, WireLive> = {};
  const netById = new Map(analysis.nets.map((n) => [n.id, n]));
  for (const wire of wires) {
    const net = netById.get(analysis.netOfWire.get(wire.id) ?? "");
    if (!net) {
      wireLive[wire.id] = { flow: "idle", level: 0 };
      continue;
    }
    const consumers = net.pins.filter((p) => {
      const r = analysis.nodes[p.node];
      return (
        r && !getPinout(nodes.find((n) => n.id === p.node)?.partId ?? "").controller && r.powered
      );
    });
    const faulty = analysis.faults.some((f) => f.severity === "error" && f.wires.includes(wire.id));
    if (net.kind === "short" || net.kind === "conflict" || faulty) {
      wireLive[wire.id] = { flow: "fault", level: 1 };
    } else if (net.kind === "power") {
      wireLive[wire.id] = { flow: "power", level: consumers.length ? 1 : 0 };
    } else if (net.kind === "ground") {
      wireLive[wire.id] = { flow: "ground", level: consumers.length ? 1 : 0 };
    } else {
      const level = Math.max(0, ...net.pins.map((p) => pins[pinKey(p)] ?? 0));
      const anyBus = net.pins.some((p) => {
        const pin = getPinout(nodes.find((n) => n.id === p.node)?.partId ?? "").pins.find(
          (x) => x.id === p.pin,
        );
        return (
          pin?.role &&
          ["io", "sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"].includes(pin.role)
        );
      });
      wireLive[wire.id] = { flow: anyBus ? "data" : "signal", level: running ? level : 0 };
    }
  }

  return wireLive;
}

/** One line of serial output a board would print each second. */
export function serialLine(nodes: LabNode[], frame: Frame): string | null {
  const parts: string[] = [];
  for (const node of nodes) {
    const l = frame.nodes[node.id];
    if (!l || !l.readings.length || getPinout(node.partId).controller) continue;
    if (isSensorPart(node.partId))
      parts.push(`${node.label}: ${l.readings.map((r) => r.value).join(", ")}`);
  }
  for (const node of nodes) {
    const l = frame.nodes[node.id];
    if (
      !l ||
      isSensorPart(node.partId) ||
      getPinout(node.partId).controller ||
      getPinout(node.partId).passive ||
      !l.badge
    )
      continue;
    parts.push(`${node.label}: ${l.badge}`);
  }
  if (!parts.length) return null;
  return `[${frame.t.toFixed(1)}s] ${parts.join(" | ")}`;
}
