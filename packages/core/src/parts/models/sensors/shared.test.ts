import { describe, expect, it } from "vitest";
import { DHT_STEPS_11, dhtHousing, serpentine } from "./shared";

describe("sensor part helpers", () => {
  it("a photoresistor's track snakes across its face, inside its circle", () => {
    const track = serpentine(5, 5, 2);
    expect(track.kind).toBe("path");
    if (track.kind === "path") {
      const xs = [...track.d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map((m) =>
        Number(m[1]),
      );
      expect(xs.length).toBeGreaterThan(4);
      for (const x of xs) expect(Math.abs(x - 5)).toBeLessThanOrEqual(2);
    }
  });

  it("a DHT housing is the grille box with its label printed on it", () => {
    const solids = dhtHousing("DHT22");
    expect(solids.length).toBeGreaterThan(3);
    expect(solids.some((s) => s.kind === "text" && s.text === "DHT22")).toBe(true);
  });

  it("the DHT11's experiment walks through the one-wire exchange in order", () => {
    expect(DHT_STEPS_11).toHaveLength(4);
    expect(DHT_STEPS_11[0]).toMatch(/pulls DATA low/);
  });
});
