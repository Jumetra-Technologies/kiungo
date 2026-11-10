// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import { buildStarter } from "../project";
import type { LabNode, LabWire } from "../lab/types";
import { billOfMaterials, bomCsv, bomText, partReadiness } from "./readiness";

type Mode = LabNode["mode"];

function circuit(starter: string, modes: { board?: Mode; parts?: Mode } = {}) {
  const { session } = buildStarter({ name: "x", board: "arduino-uno", starter });
  const nodes = session.nodes.map((n, i) => ({
    ...n,
    mode: i === 0 ? (modes.board ?? "physical") : (modes.parts ?? n.mode),
  }));
  return { nodes, wires: session.wires, board: nodes[0] };
}

describe("where each part runs, and what to have on the desk (VER-01, VER-03)", () => {
  it("a real board with a virtual sensor is Hybrid; the sensor is played by the lab", () => {
    const { nodes, wires } = circuit("distance");
    const rows = partReadiness(nodes, analyze(nodes, wires));
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["Arduino Uno", "hybrid"],
      ["HC-SR04", "virtual"],
    ]);
  });

  it("everything on the desk is Real; an emulated board is Virtual", () => {
    const real = circuit("distance", { parts: "physical" });
    expect(partReadiness(real.nodes, analyze(real.nodes, real.wires)).map((r) => r.status)).toEqual(
      ["real", "real"],
    );
    const lab = circuit("distance", { board: "virtual" });
    expect(partReadiness(lab.nodes, analyze(lab.nodes, lab.wires)).map((r) => r.status)).toEqual([
      "virtual",
      "virtual",
    ]);
  });

  it("a part Kiungo can't play on a real board yet says so", () => {
    const { nodes, wires, board } = circuit("blink");
    const ds = {
      ...nodes[1]!,
      id: "ds",
      partId: "ds18b20",
      label: "DS18B20",
      mode: "virtual" as const,
    };
    const w: LabWire[] = [
      ...wires,
      { id: "w-ds", from: { node: board!.id, pin: "D4" }, to: { node: "ds", pin: "DQ" } },
    ];
    const row = partReadiness([...nodes, ds], analyze([...nodes, ds], w)).find(
      (r) => r.nodeId === "ds",
    )!;
    expect(row.status).toBe("unavailable");
  });

  it("the desk list has the real board and what's marked Physical; Everything lists the whole build", () => {
    const { nodes, wires } = circuit("obstacle-avoider");
    const desk = billOfMaterials(nodes, wires, "desk");
    expect(desk.map((l) => [l.name, l.quantity])).toEqual([
      ["Arduino Uno", 1],
      ["USB cable for the board", 1],
    ]);
    const all = billOfMaterials(nodes, wires, "all");
    expect(all.find((l) => l.id === "dc-motor")?.quantity).toBe(2);
    expect(all.find((l) => l.id === "jumper-wire")?.quantity).toBe(wires.length);
    expect(all.map((l) => l.id)).toContain("battery-pack");
    expect(bomText(all).split("\n")[0]).toBe("1 × Arduino Uno");
    expect(bomCsv([{ id: "x", name: 'Wire, "red"', quantity: 2 }])).toBe(
      'Part,Quantity,Notes\n"Wire, ""red""",2,\n',
    );
  });
});
