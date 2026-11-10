import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { RASPBERRY_PI_PICO } from "./raspberry-pi-pico";

describe("Raspberry Pi Pico", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(RASPBERRY_PI_PICO);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(RASPBERRY_PI_PICO.id).pins.map((p) => p.id)).toEqual([
      "VBUS",
      "VSYS",
      "3V3",
      "GND1",
      "GP0",
      "GP1",
      "GP2",
      "GP3",
      "GP4",
      "GP5",
      "GP6",
      "GP7",
      "GP8",
      "GP9",
      "GP10",
      "GP11",
      "GND2",
      "GP28",
      "GP27",
      "GP26",
      "GP22",
      "GP21",
      "GP20",
      "GP19",
      "GP18",
      "GP17",
      "GP16",
      "GP15",
      "GP14",
      "GP13",
      "GP12",
    ]);
    expect(RASPBERRY_PI_PICO.pins.map((p) => p.name)).toEqual([
      "GP0–GP22",
      "GP26–GP28",
      "GP25",
      "VBUS",
      "VSYS",
      "3V3",
      "GND",
      "RUN",
      "SWCLK / SWDIO",
    ]);
  });
});
