import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { MICROBIT } from "./microbit";

describe("BBC micro:bit", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(MICROBIT);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(MICROBIT.id).pins.map((p) => p.id)).toEqual([
      "3V",
      "GND1",
      "P0",
      "P1",
      "P2",
      "GND2",
      "P8",
      "P12",
      "P13",
      "P14",
      "P15",
      "P16",
      "P19",
      "P20",
    ]);
    expect(MICROBIT.pins.map((p) => p.name)).toEqual([
      "P0 / P1 / P2",
      "P3–P16",
      "P19 / P20",
      "P13 / P14 / P15",
      "3V",
      "GND",
    ]);
  });
});
