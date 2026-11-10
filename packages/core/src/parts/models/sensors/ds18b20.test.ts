import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { DS18B20 } from "./ds18b20";

describe("DS18B20 temperature probe", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(DS18B20);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(DS18B20.id).pins.map((p) => p.id)).toEqual(["GND", "DQ", "VDD"]);
    expect(DS18B20.pins.map((p) => p.name)).toEqual(["GND", "DQ", "VDD"]);
  });
});
