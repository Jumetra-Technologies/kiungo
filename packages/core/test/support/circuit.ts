/** Small hand-wired circuits for the circuit checks' tests. */
import { analyze } from "../../src/lab/circuit";
import type { DeviceMode, LabNode, LabWire, NodeInputs } from "../../src/lab/types";

export const part = (id: string, partId: string, mode: DeviceMode = "virtual"): LabNode => ({
  id,
  partId,
  label: id,
  x: 0,
  y: 0,
  mode,
});

let seq = 0;
/** A wire from a.pin to b.pin, written "uno.D13". */
export const wire = (from: string, to: string): LabWire => {
  const [a = "", ap = ""] = from.split(".");
  const [b = "", bp = ""] = to.split(".");
  return { id: `w${++seq}`, from: { node: a, pin: ap }, to: { node: b, pin: bp } };
};

/** Analyze parts wired as "a.pin>b.pin" strings. */
export function circuit(nodes: LabNode[], wires: string[], inputs?: Record<string, NodeInputs>) {
  const ws = wires.map((s) => {
    const [from = "", to = ""] = s.split(">");
    return wire(from, to);
  });
  return { nodes, wires: ws, analysis: analyze(nodes, ws, inputs) };
}

/** The ids of a part's faults, without the part's own id on the end. */
export const faultKeys = (a: ReturnType<typeof analyze>, nodeId: string): string[] =>
  (a.nodes[nodeId]?.faults ?? []).map((f) => f.id.replace(new RegExp(`:${nodeId}$`), ""));
