import { describe, expect, expectTypeOf, it } from "vitest";
import { LEVEL_CODES, LEVEL_NAMES, PIN_SLOTS, type FromWorker, type ToWorker } from "./protocol";

describe("the worker's messages", () => {
  it("pin levels round-trip through their byte codes", () => {
    for (const name of LEVEL_NAMES) expect(LEVEL_NAMES[LEVEL_CODES[name]]).toBe(name);
    expect(LEVEL_CODES).toEqual({ input: 0, low: 1, high: 2, pullup: 3 });
  });

  it("the shared buffer has a slot for every Arduino pin number up to 31", () => {
    expect(PIN_SLOTS).toBe(32);
  });

  it("names every message the app and the worker exchange", () => {
    expectTypeOf<ToWorker["type"]>().toEqualTypeOf<
      | "load"
      | "start"
      | "stop"
      | "input"
      | "peripherals"
      | "serial-in"
      | "world"
      | "world-obstacles"
    >();
    expectTypeOf<Extract<FromWorker, { type: "readings" }>>().toHaveProperty("crashed");
  });
});
