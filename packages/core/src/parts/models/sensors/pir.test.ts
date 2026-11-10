import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { PIR } from "./pir";

describe("PIR motion sensor (HC-SR501)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(PIR);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(PIR.id).pins.map((p) => p.id)).toEqual(["VCC", "OUT", "GND"]);
    expect(PIR.pins.map((p) => p.name)).toEqual(["VCC", "OUT", "GND"]);
  });
});
