import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { TEENSY } from "./teensy";

describe("Teensy 4.1", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(TEENSY);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(TEENSY.id).pins.map((p) => p.id)).toEqual([
      "VIN",
      "3V3",
      "GND1",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "GND2",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
    ]);
    expect(TEENSY.pins.map((p) => p.name)).toEqual([
      "0–41",
      "A0–A17",
      "0 / 1, 7 / 8, 14 / 15 …",
      "18 / 19",
      "11 / 12 / 13",
      "22 / 23",
      "VIN",
      "3.3V",
      "GND",
    ]);
  });
});
