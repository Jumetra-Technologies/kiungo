/** Builds wired the way the lab's Auto-wire wires them, and their frames. */
import { planAutoWire } from "../../src/lab/autowire";
import { analyze } from "../../src/lab/circuit";
import { frameAt } from "../../src/lab/simulate";
import type { LabNode, LabWire, NodeInputs } from "../../src/lab/types";

export function wired(board: string, ...parts: string[]) {
  const nodes: LabNode[] = [
    { id: "board", partId: board, label: "Board", x: 0, y: 0, mode: "virtual" },
  ];
  let wires: LabWire[] = [];
  for (const [i, partId] of parts.entries()) {
    const id = parts.indexOf(partId) === i ? partId : `${partId}-${i}`;
    const node: LabNode = { id, partId, label: id, x: 400 + i * 60, y: 0, mode: "virtual" };
    nodes.push(node);
    wires = [
      ...wires,
      ...planAutoWire(node, nodes, wires).wires.map((w, k) => ({ id: `${id}-${k}`, ...w })),
    ];
  }
  const at = (t: number, opts: { running?: boolean; inputs?: Record<string, NodeInputs> } = {}) => {
    const analysis = analyze(nodes, wires, opts.inputs);
    return frameAt({
      nodes,
      wires,
      analysis,
      t,
      running: opts.running ?? true,
      inputs: opts.inputs,
    });
  };
  return {
    nodes,
    wires,
    at,
    without: (pin: string, partId: string) =>
      wires.filter((w) => !(w.to.node === partId && w.to.pin === pin)),
  };
}
