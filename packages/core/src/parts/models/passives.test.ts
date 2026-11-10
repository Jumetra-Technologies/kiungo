import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../test/support/part-model";
import {
  DEFAULT_OHMS,
  PASSIVES,
  RESISTOR,
  RESISTOR_VALUES,
  formatOhms,
  resistorBands,
  withResistorValue,
} from "./passives";

describe("the resistor", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(RESISTOR);
    expect(PASSIVES).toEqual([RESISTOR]);
  });

  it("offers the usual kit values, 220 Ω by default", () => {
    expect(RESISTOR_VALUES).toEqual([100, 220, 330, 470, 1000, 2200, 4700, 10000]);
    expect(DEFAULT_OHMS).toBe(220);
  });

  it("writes values as they're printed", () => {
    expect(formatOhms(220)).toBe("220 Ω");
    expect(formatOhms(1000)).toBe("1 kΩ");
    expect(formatOhms(4700)).toBe("4.7 kΩ");
    expect(formatOhms(10000)).toBe("10 kΩ");
  });

  it("reads its bands as a 5 % resistor: two digits, how many zeros, gold", () => {
    const [d1, d2, zeros, tolerance] = resistorBands(220);
    expect(d1).toBe(d2); // red, red
    const [, , oneZero] = resistorBands(220);
    const [, , twoZeros] = resistorBands(2200);
    expect(oneZero).not.toBe(twoZeros);
    expect(zeros).toBe(resistorBands(470)[2]); // brown: one zero for both
    expect(tolerance).toBe(resistorBands(10000)[3]); // always gold
    expect(resistorBands(4700)[0]).not.toBe(d1); // yellow, not red
  });

  it("repaints its bands and renames itself for a value, and remembers the result", () => {
    const r = withResistorValue(RESISTOR, 4700);
    expect(r.name).toBe("Resistor (4.7 kΩ)");
    const bands = r.solids.filter((s) => s.kind === "box" && s.id?.startsWith("band-"));
    expect(bands.map((s) => (s.kind === "box" ? s.top : ""))).toEqual(resistorBands(4700));
    expect(withResistorValue(RESISTOR, 4700)).toBe(r);
    expect(withResistorValue(BREADBOARD_NOT_RESISTOR, 4700)).toBe(BREADBOARD_NOT_RESISTOR);
  });
});

const BREADBOARD_NOT_RESISTOR = { ...RESISTOR, id: "breadboard" };
