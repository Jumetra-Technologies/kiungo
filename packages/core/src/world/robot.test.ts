// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import { buildStarter } from "../project";
import { CHASSIS, robotFromCircuit, robotWiring } from "./robot";

function template(id: string) {
  const { session, world } = buildStarter({ name: "Robot", board: "arduino-uno", starter: id });
  const analysis = analyze(session.nodes, session.wires, session.inputs);
  const boardId = session.nodes[0]!.id;
  const robot = robotFromCircuit(session.nodes, analysis, boardId)!;
  return {
    session,
    analysis,
    boardId,
    robot,
    world: world!,
    wiring: robotWiring(robot, session.nodes, analysis, boardId),
  };
}

describe("the robot the circuit makes (OUT-03, WLD-05)", () => {
  it("two motors are the wheels; the HC-SR04 looks forward from the front", () => {
    const { session, robot } = template("obstacle-avoider");
    const [, m1, m2, sonar] = session.nodes;
    expect(robot.motors).toEqual({ left: m1!.id, right: m2!.id });
    expect(robot.sensors).toEqual([
      { nodeId: sonar!.id, kind: "distance", pose: { x: CHASSIS.length / 2, y: 0, heading: 0 } },
    ]);
  });

  it("the light sensors look down either side of the line, left first", () => {
    const { session, robot } = template("line-follower");
    const ldrs = session.nodes.filter((n) => n.partId === "ldr");
    expect(robot.sensors.map((s) => [s.nodeId, s.kind, Math.sign(s.pose.y)])).toEqual([
      [ldrs[0]!.id, "floor", 1],
      [ldrs[1]!.id, "floor", -1],
    ]);
  });

  it("the wiring names the board pins of each wheel and sensor", () => {
    const t = template("obstacle-avoider");
    expect(t.wiring).toEqual({
      left: { en: 5, in1: 2, in2: 3 },
      right: { en: 9, in1: 4, in2: 6 },
      sensors: [{ nodeId: t.session.nodes[3]!.id, kind: "distance", trig: 7, echo: 8 }],
    });
  });

  it("a circuit without two motors isn't a robot", () => {
    const { session } = buildStarter({ name: "x", board: "arduino-uno", starter: "blink" });
    expect(
      robotFromCircuit(session.nodes, analyze(session.nodes, session.wires), session.nodes[0]!.id),
    ).toBeNull();
  });
});
