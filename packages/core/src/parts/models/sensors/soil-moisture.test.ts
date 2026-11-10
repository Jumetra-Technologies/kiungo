import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { SOIL_MOISTURE } from "./soil-moisture";

describe("Soil moisture sensor", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(SOIL_MOISTURE);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(SOIL_MOISTURE.id).pins.map((p) => p.id)).toEqual(["VCC", "GND", "D0", "A0"]);
    expect(SOIL_MOISTURE.pins.map((p) => p.name)).toEqual(["VCC", "GND", "D0", "A0"]);
  });
});
