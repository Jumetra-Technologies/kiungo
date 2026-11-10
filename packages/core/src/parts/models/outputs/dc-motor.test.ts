import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { DC_MOTOR } from "./dc-motor";

describe("DC gear motor (TT)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(DC_MOTOR);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(DC_MOTOR.id).pins.map((p) => p.id)).toEqual(["VM", "GND", "IN1", "IN2", "EN"]);
    expect(DC_MOTOR.pins.map((p) => p.name)).toEqual(["M1", "M2", "IN1 / IN2", "EN / PWM"]);
  });
});
