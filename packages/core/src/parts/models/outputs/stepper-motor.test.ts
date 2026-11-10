import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { STEPPER_MOTOR } from "./stepper-motor";

describe("Stepper motor, 28BYJ-48 + ULN2003", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(STEPPER_MOTOR);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(STEPPER_MOTOR.id).pins.map((p) => p.id)).toEqual([
      "IN1",
      "IN2",
      "IN3",
      "IN4",
      "VCC",
      "GND",
    ]);
    expect(STEPPER_MOTOR.pins.map((p) => p.name)).toEqual(["IN1–IN4", "+", "−", "Motor plug"]);
  });
});
