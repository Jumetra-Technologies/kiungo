import { describe, expect, it } from "vitest";
import {
  BREADBOARD_COLUMNS,
  BREADBOARD_HOLES,
  BREADBOARD_SIZE,
  BREADBOARD_SPECS,
  BREADBOARD_STRIPS,
  RAIL_HOLES,
  RAIL_IDS,
  RAILS,
  TERMINAL_ROWS,
  breadboardSpec,
  stripName,
} from "./spec";

const at = (id: string) => BREADBOARD_HOLES.find((h) => h.id === id)!;

describe("breadboard layouts", () => {
  it("the half-size board is 400 points: 30 columns of a–e and f–j, four 25-hole rails", () => {
    expect(TERMINAL_ROWS).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(BREADBOARD_COLUMNS).toBe(30);
    expect(RAIL_HOLES).toBe(25);
    expect(BREADBOARD_HOLES).toHaveLength(400);
    expect(BREADBOARD_STRIPS).toHaveLength(64);
    expect(BREADBOARD_STRIPS.filter((s) => s.length === 5)).toHaveLength(60);
    expect(BREADBOARD_STRIPS.filter((s) => s.length === 25)).toHaveLength(4);
    expect(RAIL_IDS.sort()).toEqual(["BN", "BP", "TN", "TP"]);
  });

  it("holes sit on the 0.1 inch grid, with a channel three pitches wide and rail holes in fives", () => {
    expect(at("a2").x - at("a1").x).toBeCloseTo(2.54, 2);
    expect(at("b1").y - at("a1").y).toBeCloseTo(2.54, 2);
    expect(at("f1").y - at("e1").y).toBeCloseTo(7.62, 2);
    expect(at("TP6").x - at("TP5").x).toBeCloseTo(5.08, 2);
    for (const h of BREADBOARD_HOLES) {
      expect(h.x).toBeGreaterThan(0);
      expect(h.x).toBeLessThan(BREADBOARD_SIZE.w);
      expect(h.y).toBeGreaterThan(0);
      expect(h.y).toBeLessThan(BREADBOARD_SIZE.h);
    }
  });

  it("a 170-point mini with no rails and an 830-point full-size with four 50-hole rails", () => {
    const mini = BREADBOARD_SPECS["breadboard-mini"]!;
    const full = BREADBOARD_SPECS["breadboard-full"]!;
    expect(mini.holes).toHaveLength(170);
    expect(mini.strips).toHaveLength(34);
    expect(Object.keys(mini.rails)).toEqual([]);
    expect(full.holes).toHaveLength(830);
    expect(full.strips.filter((s) => s.length === 50)).toHaveLength(4);
    expect(full.strips.filter((s) => s.length === 5)).toHaveLength(126);
  });

  it("looks a layout up by part, and names strips as people do", () => {
    expect(breadboardSpec("breadboard")).toBe(BREADBOARD_SPECS.breadboard);
    expect(breadboardSpec("led")).toBeUndefined();
    expect(stripName("TP")).toBe(`${RAILS.TP.label} rail`);
    expect(stripName("a-e:12")).toBe("Column 12, a–e");
    expect(stripName("f-j:3")).toBe("Column 3, f–j");
  });
});
