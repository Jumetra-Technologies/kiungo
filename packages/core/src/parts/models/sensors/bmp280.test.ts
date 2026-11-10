import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { BMP280 } from "./bmp280";

describe("BMP280 pressure & altitude", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(BMP280);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(BMP280.id).pins.map((p) => p.id)).toEqual([
      "VCC",
      "GND",
      "SCL",
      "SDA",
      "CSB",
      "SDO",
    ]);
    expect(BMP280.pins.map((p) => p.name)).toEqual(["VCC", "GND", "SCL", "SDA", "CSB", "SDO"]);
  });
});
