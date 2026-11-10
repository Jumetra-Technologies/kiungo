import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { LCD_16X2 } from "./lcd-16x2";

describe("LCD 16×2 (I2C)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(LCD_16X2);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(LCD_16X2.id).pins.map((p) => p.id)).toEqual(["GND", "VCC", "SDA", "SCL"]);
    expect(LCD_16X2.pins.map((p) => p.name)).toEqual(["GND", "VCC", "SDA", "SCL"]);
  });
});
