import { describe, expect, it } from "vitest";
import { boardGeometry } from "@kiungo/core/lab/board-geometry";
import { nodeLayout } from "@kiungo/core/lab/layout";
import { getPinout } from "@kiungo/core/lab/pinout";
import { getPart } from "@kiungo/core/parts";

const BARE = ["arduino-uno", "esp32", "raspberry-pi-pico"];

describe("boards drawn as themselves on the lab canvas", () => {
  it.each(BARE)("%s: every lab pin has a hole on the board, and every hole is a lab pin", (id) => {
    const part = getPart(id)!;
    const pins = getPinout(id).pins.map((p) => p.id);
    const holes = Object.keys(part.canvas!.pins);
    expect(holes.sort()).toEqual([...pins].sort());
    for (const [pin, at] of Object.entries(part.canvas!.pins)) {
      expect(at.x, pin).toBeGreaterThan(0);
      expect(at.x, pin).toBeLessThan(part.size.w);
      expect(at.y, pin).toBeGreaterThan(0);
      expect(at.y, pin).toBeLessThan(part.size.h);
    }
  });

  it.each(BARE)("%s: is bare in 3D and 2D and a card in Trace", (id) => {
    expect(nodeLayout(id, "reality").bare).toBeTruthy();
    expect(nodeLayout(id, "top").bare).toBeTruthy();
    expect(boardGeometry(id, "flow")).toBeNull();
  });

  it("puts the ESP32's headers in the DevKit V1 order: VIN by the USB on top, 3V3 by the USB below", () => {
    const pins = getPart("esp32")!.canvas!.pins;
    const top = Object.entries(pins).filter(([, p]) => p.y < 14).sort((a, b) => a[1].x - b[1].x).map(([id]) => id);
    const bottom = Object.entries(pins).filter(([, p]) => p.y > 14).sort((a, b) => a[1].x - b[1].x).map(([id]) => id);
    expect(top.slice(0, 3)).toEqual(["VIN", "GND1", "D13"]);
    expect(top.slice(-2)).toEqual(["D39", "D36"]);
    expect(bottom.slice(0, 3)).toEqual(["3V3", "GND2", "D15"]);
    expect(bottom.slice(-2)).toEqual(["D22", "D23"]);
  });

  it("puts the Pico's pins 1–20 along the bottom and 40–21 along the top, centered on the board", () => {
    const part = getPart("raspberry-pi-pico")!;
    const pins = part.canvas!.pins;
    expect(pins.GP0.x).toBeCloseTo((51 - 19 * 2.54) / 2, 2);
    expect(pins.GP15.x - pins.GP0.x).toBeCloseTo(19 * 2.54, 2);
    expect(pins.VBUS.x).toBeCloseTo(pins.GP0.x, 2);
    expect(pins.GP16.x).toBeCloseTo(pins.GP15.x, 2);
    expect(pins.GP0.y).toBeGreaterThan(pins.VBUS.y);
  });
});
