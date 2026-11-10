import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { SERVO } from "./servo";

describe("Servo, SG90", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(SERVO);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(SERVO.id).pins.map((p) => p.id)).toEqual(["GND", "VCC", "SIG"]);
    expect(SERVO.pins.map((p) => p.name)).toEqual(["GND (brown)", "VCC (red)", "Signal (orange)"]);
  });
});
