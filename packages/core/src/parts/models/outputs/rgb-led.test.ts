import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { RGB_LED } from "./rgb-led";

describe("RGB LED, 5 mm", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(RGB_LED);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(RGB_LED.id).pins.map((p) => p.id)).toEqual(["R", "GND", "G", "B"]);
    expect(RGB_LED.pins.map((p) => p.name)).toEqual(["R", "GND", "G", "B"]);
  });
});
