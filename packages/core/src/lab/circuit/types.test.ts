import { describe, expect, it } from "vitest";
import { LED_FORWARD_V, LED_MAX_MA, LED_SERIES_OHMS, ledCurrentMa, pinKey } from "./types";

describe("circuit basics", () => {
  it("a pin's key is its part and pin", () => {
    expect(pinKey({ node: "uno", pin: "D13" })).toBe("uno:D13");
  });

  it("an LED's current from a pin through its resistor, 220 Ω when none is wired", () => {
    expect([LED_FORWARD_V, LED_SERIES_OHMS, LED_MAX_MA]).toEqual([2, 220, 20]);
    expect(ledCurrentMa(5)).toBeCloseTo(((5 - 2) / 220) * 1000, 6);
    expect(ledCurrentMa(5, 100)).toBeCloseTo(30, 6);
    expect(ledCurrentMa(3.3, 1000)).toBeCloseTo(1.3, 6);
    expect(ledCurrentMa(1.5)).toBe(0); // below the forward voltage
    expect(ledCurrentMa(5, 0)).toBeCloseTo(3000, 6); // never divides by zero
  });
});
