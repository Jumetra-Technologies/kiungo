// @vitest-environment node
/**
 * The robot templates in their worlds (sprint 8, PRJ-03): the compiled
 * starters drive the physics robot round their courses, with the emulated
 * board, the part models and Rapier stepped together. Fixtures in
 * fixtures/sketches/ are the starters' code for the Uno, compiled like
 * Arduino CLI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { analyze } from "../src/lab/circuit";
import { buildStarter } from "../src/project";
import {
  AVOIDER_COURSE,
  LINE_COURSE,
  emptyWorld,
  parseWorld,
  serializeWorld,
} from "../src/world/courses";
import { runCourse } from "../src/world/harness";
import { CHASSIS, robotFromCircuit, robotWiring } from "../src/world/robot";
import { initPhysics, onLine, RobotWorld } from "../src/world/sim";

const hex = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "sketches", `${name}-uno.hex`), "utf8");

function template(id: string) {
  const { session, world } = buildStarter({ name: "Robot", board: "arduino-uno", starter: id });
  const analysis = analyze(session.nodes, session.wires, session.inputs);
  const boardId = session.nodes[0].id;
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

beforeAll(() => initPhysics());

describe("the robot the circuit makes (OUT-03, WLD-05)", () => {
  it("two motors are the wheels; the HC-SR04 looks forward from the front", () => {
    const { session, robot } = template("obstacle-avoider");
    const [, m1, m2, sonar] = session.nodes;
    expect(robot.motors).toEqual({ left: m1.id, right: m2.id });
    expect(robot.sensors).toEqual([
      { nodeId: sonar.id, kind: "distance", pose: { x: CHASSIS.length / 2, y: 0, heading: 0 } },
    ]);
  });

  it("the light sensors look down either side of the line, left first", () => {
    const { session, robot } = template("line-follower");
    const ldrs = session.nodes.filter((n) => n.partId === "ldr");
    expect(robot.sensors.map((s) => [s.nodeId, s.kind, Math.sign(s.pose.y)])).toEqual([
      [ldrs[0].id, "floor", 1],
      [ldrs[1].id, "floor", -1],
    ]);
  });

  it("the wiring names the board pins of each wheel and sensor", () => {
    const t = template("obstacle-avoider");
    expect(t.wiring).toEqual({
      left: { en: 5, in1: 2, in2: 3 },
      right: { en: 9, in1: 4, in2: 6 },
      sensors: [{ nodeId: t.session.nodes[3].id, kind: "distance", trig: 7, echo: 8 }],
    });
  });

  it("a circuit without two motors isn't a robot", () => {
    const { session } = buildStarter({ name: "x", board: "arduino-uno", starter: "blink" });
    expect(
      robotFromCircuit(session.nodes, analyze(session.nodes, session.wires), session.nodes[0].id),
    ).toBeNull();
  });
});

describe("the world (WLD-01 to WLD-03)", () => {
  it("the line is under a point within half its width", () => {
    expect(onLine(LINE_COURSE, 1, 0.3)).toBe(true);
    expect(onLine(LINE_COURSE, 1, 0.3 + 0.008)).toBe(true);
    expect(onLine(LINE_COURSE, 1, 0.3 + 0.02)).toBe(false);
  });

  it("drives straight at the wheels' speed, and a wall stops it", () => {
    const { robot } = template("obstacle-avoider");
    const world = new RobotWorld(
      { ...emptyWorld(), start: { x: 0.3, y: 0.75, heading: 0 } },
      robot,
    );
    world.step(1, 1, 1);
    // 140 rpm on 65 mm wheels: 0.476 m/s.
    expect(world.pose().x).toBeCloseTo(0.3 + 0.476, 1);
    expect(world.pose().y).toBeCloseTo(0.75, 3);
    world.step(5, 1, 1);
    // The arena's wall is at 2 m: the chassis' front stops there.
    expect(world.pose().x).toBeLessThan(2 - CHASSIS.length / 2 + 0.01);
    expect(world.state().collisions).toBeGreaterThan(0);
    world.dispose();
  });

  it("turns on the spot when the wheels go opposite ways", () => {
    const { robot } = template("obstacle-avoider");
    const world = new RobotWorld(emptyWorld(), robot);
    world.step(0.5, 1, -1);
    // ω = 2v / track = 7.3 rad/s: half a second turns it about 3.66 rad clockwise.
    expect(world.pose().x).toBeCloseTo(0.3, 2);
    expect(Math.abs(world.pose().heading)).toBeGreaterThan(2);
    world.dispose();
  });

  it("the HC-SR04 measures the distance to the nearest thing in its cone", () => {
    const { robot } = template("obstacle-avoider");
    const world = new RobotWorld(
      { ...emptyWorld(), obstacles: [{ id: "b", x: 1, y: 0.75, w: 0.1, h: 0.3, angle: 0 }] },
      robot,
    );
    const seen = Object.values(world.sense())[0];
    // Front of the chassis at 0.3 + 0.1; the box's near face at 0.95.
    expect(seen.distanceCm).toBeCloseTo(55, 0);
    world.setObstacles([]);
    // The far wall at 2 m.
    expect(Object.values(world.sense())[0].distanceCm).toBeCloseTo(160, 0);
    world.dispose();
  });

  it("world.json round-trips, and refuses what isn't a world", () => {
    expect(parseWorld(serializeWorld(AVOIDER_COURSE))).toEqual(AVOIDER_COURSE);
    expect(parseWorld("{")).toBeNull();
    expect(parseWorld(JSON.stringify({ version: 2 }))).toBeNull();
  });
});

describe("the templates finish their courses (PRJ-03)", () => {
  it("the line follower goes once round the oval, on the line", async () => {
    const t = template("line-follower");
    const result = await runCourse({
      hex: hex("line-follower"),
      wiring: t.wiring,
      world: t.world,
      robot: t.robot,
      seconds: 40,
    });
    expect(result.state.finished).toBe(true);
    expect(result.state.collisions).toBe(0);
    // A lap of the oval (about 3.4 m) at 0.26 m/s.
    expect(result.simSeconds).toBeLessThan(25);
    // It stayed near the tape the whole way: never more than 6 cm off it.
    const off = result.path.map(
      ([x, y]) => Math.abs(Math.hypot((x - 1) / 0.65, (y - 0.7) / 0.4) - 1) * 0.4,
    );
    expect(Math.max(...off)).toBeLessThan(0.06);
  }, 120_000);

  it("the obstacle avoider reaches the goal past the boxes", async () => {
    const t = template("obstacle-avoider");
    const result = await runCourse({
      hex: hex("obstacle-avoider"),
      wiring: t.wiring,
      world: t.world,
      robot: t.robot,
      seconds: 120,
    });
    expect(result.state.finished).toBe(true);
    // Its sketch prints each distance it measures.
    expect(result.serial.split("\r\n").filter(Boolean).length).toBeGreaterThan(20);
  }, 240_000);
});
