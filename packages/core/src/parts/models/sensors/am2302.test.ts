import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { AM2302 } from "./am2302";

describe("AM2302 wired humidity & temperature", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(AM2302);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(AM2302.id).pins.map((p) => p.id)).toEqual(["VCC", "DATA", "GND"]);
    expect(AM2302.pins.map((p) => p.name)).toEqual(["Red", "Yellow", "Black"]);
  });
});
