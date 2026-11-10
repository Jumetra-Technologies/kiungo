import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { OLED_SSD1306 } from "./oled-ssd1306";

describe("OLED 0.96″ (SSD1306)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(OLED_SSD1306);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(OLED_SSD1306.id).pins.map((p) => p.id)).toEqual(["GND", "VCC", "SCL", "SDA"]);
    expect(OLED_SSD1306.pins.map((p) => p.name)).toEqual(["GND", "VCC", "SCL", "SDA"]);
  });
});
