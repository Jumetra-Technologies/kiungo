import { describe, expect, it } from "vitest";
import { getPinout } from "../../../lab/pinout";
import { PICO_PAD_X0, esp32Canvas, picoCanvas } from "./shared";

describe("board canvases", () => {
  it("the ESP32 DevKit's canvas has a hole for every pin the lab wires", () => {
    const canvas = esp32Canvas();
    expect(Object.keys(canvas.pins).sort()).toEqual(
      getPinout("esp32")
        .pins.map((p) => p.id)
        .sort(),
    );
  });

  it("the Pico's pads start centered on the 51 mm board and step 0.1 inch", () => {
    expect(PICO_PAD_X0).toBeCloseTo((51 - 19 * 2.54) / 2, 6);
    const { pins } = picoCanvas();
    expect(pins.GP0?.x).toBeCloseTo(PICO_PAD_X0, 6);
    expect((pins.GP1?.x ?? 0) - (pins.GP0?.x ?? 0)).toBeCloseTo(2.54, 6);
    expect(Object.keys(pins).sort()).toEqual(
      getPinout("raspberry-pi-pico")
        .pins.map((p) => p.id)
        .sort(),
    );
  });
});
