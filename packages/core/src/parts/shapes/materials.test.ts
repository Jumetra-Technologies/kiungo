import { describe, expect, it } from "vitest";
import { MATERIAL, PCB_TOP, STEEL_TOP, flatColor, shade } from "./materials";

describe("materials", () => {
  it("a board's parts sit on top of a standard 1.6 mm PCB", () => {
    expect(PCB_TOP).toBe(1.6);
  });

  it("shade darkens and lightens each channel, within 0–255", () => {
    expect(shade("#808080", 0.5)).toBe("#404040");
    expect(shade("#00878f", 0.55)).toBe("#004a4f");
    expect(shade("#ff8000", 2)).toBe("#ffff00");
    expect(shade("  #ABCDEF ", 1)).toBe("#abcdef");
  });

  it("leaves anything that isn't a plain hex color as it is", () => {
    expect(shade("red", 0.5)).toBe("red");
    expect(shade(STEEL_TOP, 0.5)).toBe(STEEL_TOP);
  });

  it("flat views take the first hex color of a gradient", () => {
    expect(flatColor(STEEL_TOP)).toBe("#d7dadf");
    expect(flatColor("#123456")).toBe("#123456");
    expect(flatColor("tomato")).toBe("tomato");
  });

  it("every material is a color or a gradient of colors", () => {
    for (const [name, paint] of Object.entries(MATERIAL))
      expect(flatColor(paint), name).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
