import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { RASPBERRY_PI_4 } from "./raspberry-pi-4";

describe("Raspberry Pi 4", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(RASPBERRY_PI_4);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(RASPBERRY_PI_4.id).pins.map((p) => p.id)).toEqual([
      "3V3",
      "5V",
      "GND1",
      "GPIO2",
      "GPIO3",
      "GPIO4",
      "GPIO17",
      "GPIO27",
      "GPIO22",
      "GPIO10",
      "GPIO9",
      "GPIO11",
      "GPIO5",
      "GPIO6",
      "GPIO13",
      "GPIO19",
      "GPIO26",
      "GND2",
      "GPIO14",
      "GPIO15",
      "GPIO18",
      "GPIO23",
      "GPIO24",
      "GPIO25",
      "GPIO8",
      "GPIO7",
      "GPIO12",
      "GPIO16",
      "GPIO20",
      "GPIO21",
    ]);
    expect(RASPBERRY_PI_4.pins.map((p) => p.name)).toEqual([
      "GPIO 2–27",
      "GPIO 2 / 3",
      "GPIO 14 / 15",
      "GPIO 9 / 10 / 11 / 8 / 7",
      "GPIO 12 / 13 / 18 / 19",
      "5V",
      "3V3",
      "GND",
    ]);
  });
});
