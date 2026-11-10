import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { TFT_DISPLAY } from "./tft-display";

describe("TFT 1.8″ color (ST7735)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(TFT_DISPLAY);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(TFT_DISPLAY.id).pins.map((p) => p.id)).toEqual([
      "VCC",
      "GND",
      "CS",
      "RST",
      "DC",
      "SDA",
      "SCK",
      "LED",
    ]);
    expect(TFT_DISPLAY.pins.map((p) => p.name)).toEqual([
      "VCC",
      "GND",
      "CS",
      "RST",
      "A0 (DC)",
      "SDA (MOSI)",
      "SCK",
      "LED",
    ]);
  });
});
