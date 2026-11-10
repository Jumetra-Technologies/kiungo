import { describe, expect, expectTypeOf, it } from "vitest";
import { AVOIDER_COURSE, LINE_COURSE } from "./courses";
import type { Pose, RobotSpec, SensorKind, WorldSpec, WorldState } from "./types";

describe("world types", () => {
  it("a world is in metres, with a pose to start from", () => {
    const worlds: WorldSpec[] = [LINE_COURSE, AVOIDER_COURSE];
    for (const w of worlds) {
      expect(w.version).toBe(1);
      expect(w.start.x).toBeGreaterThan(0);
      expect(w.start.x).toBeLessThan(w.arena.w);
      expect(w.start.y).toBeLessThan(w.arena.h);
    }
  });

  it("names the shapes the simulation shares with the interface", () => {
    expectTypeOf<Pose>().toEqualTypeOf<WorldSpec["start"]>();
    expectTypeOf<SensorKind>().toEqualTypeOf<"distance" | "floor">();
    expectTypeOf<RobotSpec>().toHaveProperty("motors");
    expectTypeOf<WorldState>().toHaveProperty("robot");
  });
});
