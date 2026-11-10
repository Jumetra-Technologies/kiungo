import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { LDR } from "./ldr";

describe("Light-dependent resistor", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(LDR);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(LDR.id).pins.map((p) => p.id)).toEqual(["L1", "L2"]);
    expect(LDR.pins.map((p) => p.name)).toEqual(["Leg 1", "Leg 2"]);
  });
});
