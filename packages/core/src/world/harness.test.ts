// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import { buildStarter } from "../project";
import { runCourse } from "./harness";
import { robotFromCircuit, robotWiring } from "./robot";
import { initPhysics } from "./sim";

beforeAll(() => initPhysics());

const hex = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures", "sketches", `${name}-uno.hex`), "utf8");

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
