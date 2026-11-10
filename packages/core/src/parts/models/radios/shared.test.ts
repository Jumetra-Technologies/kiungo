import { describe, expect, it } from "vitest";
import { IC_TOP, meander } from "./shared";

describe("radio part helpers", () => {
  it("a printed antenna is one copper path, zig-zagging along its length", () => {
    const solid = meander({ x: 2, y: 3, w: 12, h: 4, turns: 5 });
    expect(solid.kind).toBe("path");
    if (solid.kind === "path") {
      const moves = solid.d.match(/[MLHV]/g) ?? [];
      expect(moves[0]).toBe("M");
      expect(moves.length).toBeGreaterThan(5);
    }
  });

  it("chips have a dark top", () => {
    expect(IC_TOP).toMatch(/^linear-gradient\(/);
  });
});
