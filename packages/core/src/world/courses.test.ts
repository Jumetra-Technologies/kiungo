import { describe, expect, it } from "vitest";
import {
  AVOIDER_COURSE,
  LINE_COURSE,
  WORLD_FILE,
  emptyWorld,
  parseWorld,
  serializeWorld,
} from "./courses";

describe("world files", () => {
  it("are world.json, written with a trailing newline, and read back the same", () => {
    expect(WORLD_FILE).toBe("world.json");
    for (const world of [LINE_COURSE, AVOIDER_COURSE, emptyWorld()]) {
      const text = serializeWorld(world);
      expect(text.endsWith("}\n")).toBe(true);
      expect(parseWorld(text)).toEqual(world);
    }
  });

  it("the courses are what the starters need: a closed line, or boxes to get past to a goal", () => {
    expect(LINE_COURSE.line?.closed).toBe(true);
    expect(LINE_COURSE.line!.points.length).toBeGreaterThan(10);
    expect(AVOIDER_COURSE.obstacles.length).toBeGreaterThan(0);
    expect(AVOIDER_COURSE.checkpoints.length).toBeGreaterThan(0);
    expect(emptyWorld()).toMatchObject({ arena: { w: 2, h: 1.5 }, obstacles: [], line: null });
  });

  it("refuses what isn't a world, and clamps what's out of range", () => {
    expect(parseWorld("nope")).toBeNull();
    expect(parseWorld(JSON.stringify({ version: 2, arena: { w: 1, h: 1 }, start: {} }))).toBeNull();
    expect(
      parseWorld(JSON.stringify({ version: 1, arena: { w: "2", h: 1 }, start: {} })),
    ).toBeNull();
    const w = parseWorld(
      JSON.stringify({
        version: 1,
        arena: { w: 100, h: 0.1 },
        start: { x: "far" },
        obstacles: [{ w: -1 }, { id: "x".repeat(60), x: 1, y: 2, w: 0.2, h: 0.3, angle: 45 }],
        line: { points: [[0, 0], [1], ["a", 2], [1, 1]], width: 0 },
        checkpoints: [{ r: 0 }],
      }),
    )!;
    expect(w.arena).toEqual({ w: 10, h: 0.5 });
    expect(w.start).toEqual({ x: 0.3, y: 0.3, heading: 0 });
    expect(w.obstacles[0]).toEqual({ id: "box-1", x: 0, y: 0, w: 0.01, h: 0.1, angle: 0 });
    expect(w.obstacles[1]!.id).toHaveLength(40);
    expect(w.line).toEqual({
      points: [
        [0, 0],
        [1, 1],
      ],
      width: 0.005,
      closed: false,
    });
    expect(w.checkpoints).toEqual([{ x: 0, y: 0, r: 0.02 }]);
  });
});
