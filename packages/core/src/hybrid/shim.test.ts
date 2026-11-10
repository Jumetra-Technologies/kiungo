import { describe, expect, it } from "vitest";
import { SPRINT_2_PLAN, generateShim, pinTable } from "./shim";

describe("shim generator", () => {
  it("maps pins to sensor ids and leaves the rest real", () => {
    const table = pinTable(SPRINT_2_PLAN);
    expect(table).toHaveLength(20);
    expect(table[9]).toBe(0);
    expect(table[10]).toBe(0);
    expect(table.filter((v) => v === 0xff)).toHaveLength(18);
  });

  it("refuses bad plans", () => {
    expect(() =>
      pinTable({ board: "arduino:avr:uno", sensors: [{ id: 8, part: "x", pins: [1] }] }),
    ).toThrow(/out of range/);
    expect(() =>
      pinTable({
        board: "arduino:avr:uno",
        sensors: [
          { id: 0, part: "x", pins: [1] },
          { id: 0, part: "y", pins: [2] },
        ],
      }),
    ).toThrow(/twice/);
    expect(() =>
      pinTable({
        board: "arduino:avr:uno",
        sensors: [
          { id: 0, part: "x", pins: [1] },
          { id: 1, part: "y", pins: [1] },
        ],
      }),
    ).toThrow(/two virtual sensors/);
    expect(() =>
      pinTable({ board: "arduino:avr:uno", sensors: [{ id: 0, part: "x", pins: [20] }] }),
    ).toThrow(/doesn't exist/);
  });

  it("writes a header the core can't see and the sketch can", () => {
    const shim = generateShim(SPRINT_2_PLAN, "/build/kiungo_shim.h");
    expect(shim.cppFlags).toEqual(["-include", "/build/kiungo_shim.h"]);
    expect(shim.adapters).toEqual(["NewPing"]);
    expect(shim.header).toContain("#if __has_include(<kiungo_hybrid_marker.h>)");
    expect(shim.header).toContain(
      "#define KIUNGO_PIN_TABLE {0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0xff",
    );
    expect(shim.header).toContain("#define Serial kiungoSerial");
    expect(shim.header).toContain("#define digitalRead kiungo_digitalRead");
    expect(shim.header).toContain("sensor 0: hc-sr04 on pins 9, 10 (adapter: NewPing)");
  });

  it("with no virtual sensors still redirects Serial", () => {
    const shim = generateShim({ board: "arduino:avr:uno", sensors: [] });
    expect(shim.adapters).toEqual([]);
    expect(shim.header).toContain("only Serial is redirected");
    expect(shim.pinTable.every((v) => v === 0xff)).toBe(true);
  });
});
