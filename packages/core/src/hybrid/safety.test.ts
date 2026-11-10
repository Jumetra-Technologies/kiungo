// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import { buildStarter } from "../project";
import type { LabNode, LabWire } from "../lab/types";
import { blockingFaults, realBoardFaults, USB_MA, withFaults } from "./safety";

type Mode = LabNode["mode"];

function circuit(starter: string, modes: { board?: Mode; parts?: Mode } = {}) {
  const { session } = buildStarter({ name: "x", board: "arduino-uno", starter });
  const nodes = session.nodes.map((n, i) => ({
    ...n,
    mode: i === 0 ? (modes.board ?? "physical") : (modes.parts ?? n.mode),
  }));
  return { nodes, wires: session.wires, board: nodes[0] };
}

const check = (nodes: LabNode[], wires: LabWire[], boardId: string) => {
  const analysis = analyze(nodes, wires);
  const extra = realBoardFaults(nodes, wires, analysis, boardId);
  const merged = withFaults(analysis, extra);
  return { extra, merged, blocking: blockingFaults(nodes, merged, boardId) };
};

const kinds = (fs: { id: string }[]) => fs.map((f) => f.id.split(":")[0]);

/** Rewire one end of every wire that touches `pin` on `node` to the board's `to` pin. */
const rewire = (wires: LabWire[], node: string, pin: string, board: string, to: string) =>
  wires.map((w) =>
    w.from.node === node && w.from.pin === pin && w.to.node === board
      ? { ...w, to: { node: board, pin: to } }
      : w.to.node === node && w.to.pin === pin && w.from.node === board
        ? { ...w, from: { node: board, pin: to } }
        : w,
  );

describe("electrical checks before a run on the real board (SAF-03)", () => {
  it("the starters pass as they come, with every part on the desk", () => {
    for (const s of ["blink", "dht11", "distance", "relay", "obstacle-avoider", "line-follower"]) {
      const { nodes, wires, board } = circuit(s, { parts: "physical" });
      expect(check(nodes, wires, board!.id).blocking, s).toEqual([]);
    }
  });

  it("only applies to a board marked Physical or Hybrid", () => {
    const { nodes, wires, board } = circuit("obstacle-avoider", {
      board: "virtual",
      parts: "physical",
    });
    expect(realBoardFaults(nodes, wires, analyze(nodes, wires), board!.id)).toEqual([]);
  });

  it("a motor on the board's 5 V pin stops the run; on VIN (the barrel jack's battery) it's fine", () => {
    const { nodes, wires, board } = circuit("obstacle-avoider", { parts: "physical" });
    const motor = nodes.find((n) => n.partId === "dc-motor")!;
    const on5v = rewire(wires, motor.id, "VM", board!.id, "5V");
    const { blocking, merged } = check(nodes, on5v, board!.id);
    expect(kinds(blocking)).toContain("real-motor-supply");
    expect(blocking.find((f) => f.id.startsWith("real-motor-supply"))!.detail).toMatch(/VIN/);
    // It shows on the part too, as the lab's own problems do.
    expect(merged.nodes[motor.id]!.status).toBe("fault");
  });

  it("a motor marked Virtual draws nothing from the real board", () => {
    const { nodes, wires, board } = circuit("obstacle-avoider", { parts: "virtual" });
    const motor = nodes.find((n) => n.partId === "dc-motor")!;
    expect(
      check(nodes, rewire(wires, motor.id, "VM", board!.id, "5V"), board!.id).blocking,
    ).toEqual([]);
  });

  it("pins 0 and 1 belong to Kiungo's link", () => {
    const { nodes, wires, board } = circuit("blink", { parts: "physical" });
    const led = nodes.find((n) => n.partId === "led")!;
    const moved = wires.map((w) =>
      w.to.node === led.id && w.to.pin === "A"
        ? { ...w, from: { node: board!.id, pin: "D1" } }
        : w.from.node === led.id && w.from.pin === "A"
          ? { ...w, to: { node: board!.id, pin: "D1" } }
          : w,
    );
    const { blocking } = check(nodes, moved, board!.id);
    expect(blocking.map((f) => f.title)).toContain("D1 is Kiungo's link");
  });

  it("warns as the parts on the board's 5 V add up past what USB gives", () => {
    const { nodes, wires, board } = circuit("servo", { parts: "physical" });
    const servo = nodes.find((n) => n.partId === "servo")!;
    // Two more servos on the same 5 V pin.
    const more = [1, 2].map((i) => ({ ...servo, id: `${servo.id}-${i}`, label: `Servo ${i + 1}` }));
    const moreWires = more.flatMap((s) =>
      wires
        .filter((w) => w.to.node === servo.id || w.from.node === servo.id)
        .map((w, j) => ({
          ...w,
          id: `${w.id}-${s.id}-${j}`,
          from: w.from.node === servo.id ? { ...w.from, node: s.id } : w.from,
          to: w.to.node === servo.id ? { ...w.to, node: s.id } : w.to,
        })),
    );
    const { extra } = check([...nodes, ...more], [...wires, ...moreWires], board!.id);
    const budget = extra.find((f) => f.id.startsWith("real-budget"))!;
    expect(budget.title).toMatch(/900 mA/);
    expect(budget.severity).toBe(900 > USB_MA ? "error" : "warning");
    expect(kinds(extra).filter((k) => k === "real-servo-supply")).toHaveLength(3);
  });

  it("a part that isn't wired yet doesn't stop the run: it only doesn't work", () => {
    const { nodes, wires, board } = circuit("distance", { parts: "physical" });
    const sensor = nodes.find((n) => n.partId === "hc-sr04")!;
    const unwired = wires.filter(
      (w) =>
        !(w.from.node === sensor.id && w.from.pin === "ECHO") &&
        !(w.to.node === sensor.id && w.to.pin === "ECHO"),
    );
    const { merged, blocking } = check(nodes, unwired, board!.id);
    expect(merged.faults.some((f) => f.severity === "error")).toBe(true);
    expect(blocking).toEqual([]);
  });
});
