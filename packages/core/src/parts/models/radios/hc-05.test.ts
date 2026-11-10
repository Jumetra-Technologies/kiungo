import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { HC_05 } from "./hc-05";

describe("HC-05 Bluetooth", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(HC_05);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(HC_05.id).pins.map((p) => p.id)).toEqual([
      "STATE",
      "RXD",
      "TXD",
      "GND",
      "VCC",
      "EN",
    ]);
    expect(HC_05.pins.map((p) => p.name)).toEqual([
      "STATE",
      "RXD",
      "TXD",
      "GND",
      "VCC",
      "EN / KEY",
    ]);
  });
});
