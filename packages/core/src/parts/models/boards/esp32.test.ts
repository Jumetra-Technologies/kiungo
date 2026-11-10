import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { ESP32 } from "./esp32";

describe("ESP32 DevKit", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(ESP32);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(ESP32.id).pins.map((p) => p.id)).toEqual([
      "VIN",
      "GND1",
      "D36",
      "D39",
      "D34",
      "D35",
      "D32",
      "D33",
      "D25",
      "D26",
      "D27",
      "D14",
      "D12",
      "D13",
      "3V3",
      "GND2",
      "D23",
      "D22",
      "TX",
      "RX",
      "D21",
      "D19",
      "D18",
      "D5",
      "D17",
      "D16",
      "D4",
      "D2",
      "D15",
    ]);
    expect(ESP32.pins.map((p) => p.name)).toEqual([
      "VIN",
      "3V3",
      "GND",
      "EN",
      "GPIO 0–39",
      "GPIO 32–39",
      "GPIO 2",
      "TX0 / RX0",
      "GPIO 21 / 22",
      "GPIO 18 / 19 / 23 / 5",
      "GPIO 25 / 26",
    ]);
  });
});
