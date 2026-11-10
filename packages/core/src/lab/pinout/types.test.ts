import { describe, expect, expectTypeOf, it } from "vitest";
import { PINOUTS } from "./registry";
import type { LabPin, PinFn, PinRole, Pinout } from "./types";

describe("pinout types", () => {
  it("every pin in the lab uses the declared functions and roles", () => {
    const fns = new Set<string>([
      "digital",
      "analog",
      "pwm",
      "power",
      "ground",
      "led",
      "sda",
      "scl",
      "tx",
      "rx",
      "mosi",
      "miso",
      "sck",
      "cs",
    ]);
    const roles = new Set<string>([
      "vcc",
      "gnd",
      "drive",
      "pwm",
      "cs",
      "out-digital",
      "out-analog",
      "io",
      "sda",
      "scl",
      "tx",
      "rx",
      "mosi",
      "miso",
      "sck",
      "opt",
      "load",
    ]);
    for (const pinout of PINOUTS)
      for (const pin of pinout.pins) {
        for (const f of pin.fns ?? [])
          expect(fns.has(f), `${pinout.partId} ${pin.id} ${f}`).toBe(true);
        if (pin.role)
          expect(roles.has(pin.role), `${pinout.partId} ${pin.id} ${pin.role}`).toBe(true);
      }
  });

  it("names what a pin and a pinout carry", () => {
    expectTypeOf<LabPin>().toHaveProperty("id");
    expectTypeOf<Pinout>().toHaveProperty("controller");
    expectTypeOf<PinFn>().toMatchTypeOf<string>();
    expectTypeOf<PinRole>().toMatchTypeOf<string>();
  });
});
