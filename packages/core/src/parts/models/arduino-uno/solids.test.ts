import { describe, expect, it } from "vitest";
import { TEAL } from "./layout";
import { UNO_SOLIDS } from "./solids";

const texts = () =>
  UNO_SOLIDS.filter((s) => s.kind === "text").map((s) => (s as { text: string }).text);

describe("the Uno's solids", () => {
  it("are on a teal PCB with the USB-B overhanging the left edge", () => {
    const pcb = UNO_SOLIDS.find((s) => s.kind === "box" && s.id === "pcb") as { top: string };
    expect(pcb.top).toBe(TEAL);
    const usb = UNO_SOLIDS.find((s) => s.kind === "box" && s.id === "usb") as { x: number };
    expect(usb.x).toBeLessThan(0);
  });

  it("carry the functional silkscreen only: no Kiungo branding, and no Arduino logo or wordmark", () => {
    const all = texts().join(" ");
    expect(all).not.toMatch(/Kiungo/i);
    expect(all).not.toMatch(/ARDUINO|UNO/);
    for (const label of [
      "DIGITAL (PWM~)",
      "POWER",
      "ANALOG IN",
      "L",
      "TX",
      "RX",
      "ON",
      "ICSP",
      "RESET",
      "AREF",
    ])
      expect(texts()).toContain(label);
  });

  it("give the lit parts ids the lab can light", () => {
    const ids = new Set(UNO_SOLIDS.map((s) => ("id" in s ? s.id : undefined)));
    for (const id of ["led-l", "led-on"]) expect(ids.has(id), id).toBe(true);
  });
});
