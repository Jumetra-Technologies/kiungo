import { describe, expect, it } from "vitest";
import { TAN, leg } from "./shared";

describe("output part helpers", () => {
  it("a leg is one pin hanging below the part, centered where it's put, as long as asked", () => {
    expect(leg(10, 20, 15)).toEqual({
      kind: "pins",
      x: 10 - 1.27,
      y: 20 - 1.27,
      count: 1,
      pitch: 2.54,
      dir: "x",
      len: -15,
      z: 0,
      size: 0.5,
    });
  });

  it("the tan of a motor's or servo's plastic has a darker side", () => {
    expect(TAN.top).toMatch(/^#[0-9a-f]{6}$/);
    expect(TAN.side).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseInt(TAN.side.slice(1), 16)).toBeLessThan(parseInt(TAN.top.slice(1), 16));
  });
});
