// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import { buildStarter } from "../project";
import { AVOIDER_COURSE, LINE_COURSE, emptyWorld, parseWorld, serializeWorld } from "./courses";
import { CHASSIS, robotFromCircuit, robotWiring } from "./robot";
import { initPhysics, onLine, RobotWorld } from "./sim";

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

beforeAll(() => initPhysics());

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
    expect(seen!.distanceCm).toBeCloseTo(55, 0);
    world.setObstacles([]);
    // The far wall at 2 m.
    expect(Object.values(world.sense())[0]!.distanceCm).toBeCloseTo(160, 0);
    world.dispose();
  });

  it("world.json round-trips, and refuses what isn't a world", () => {
    expect(parseWorld(serializeWorld(AVOIDER_COURSE))).toEqual(AVOIDER_COURSE);
    expect(parseWorld("{")).toBeNull();
    expect(parseWorld(JSON.stringify({ version: 2 }))).toBeNull();
  });
});
