import { describe, expect, it } from "vitest";
import type { Solid } from "../types";
import { chip, crystal, dip, qfp, shieldCan, sot223, wifiModule } from "./chips";
import { PCB_TOP } from "./materials";

type Box = Extract<Solid, { kind: "box" }>;
type Pins = Extract<Solid, { kind: "pins" }>;
const pins = (solids: Solid[]) => solids.filter((s): s is Pins => s.kind === "pins");

describe("chips", () => {
  it("a DIP is as long as its pins at 0.1 inch, with a row of legs down each long side", () => {
    const solids = dip({ x: 0, y: 0, pinsPerSide: 14, label: "ATMEGA328P" });
    const body = solids[0] as Box;
    expect(body.label?.text).toBe("ATMEGA328P");
    const legs = pins(solids);
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.count === 14 && l.pitch === 2.54)).toBe(true);
    expect(Math.max(body.w, body.h)).toBeCloseTo(14 * 2.54, 1);
  });

  it("a flat chip carries its label when it has one", () => {
    expect(chip({ x: 0, y: 0, w: 7, h: 7, label: "CH340", id: "usb-chip" })).toMatchObject({
      kind: "box",
      id: "usb-chip",
      z: PCB_TOP,
      label: { text: "CH340" },
    });
    expect((chip({ x: 0, y: 0, w: 2, h: 2, id: "x" }) as Box).label).toBeUndefined();
  });

  it("a quad flat package has legs on all four sides", () => {
    const solids = qfp({ x: 0, y: 0, side: 10, perSide: 16, label: "STM32", id: "mcu" });
    expect((solids[0] as Box).id).toBe("mcu");
    const legs = pins(solids);
    expect(legs).toHaveLength(4);
    expect(legs.every((l) => l.count === 16)).toBe(true);
    expect(new Set(legs.map((l) => l.dir))).toEqual(new Set(["x", "y"]));
  });

  it("a Wi-Fi module is its own PCB with the shield can and a printed antenna", () => {
    const solids = wifiModule({ x: 0, y: 0, w: 18, h: 25.5, shieldW: 15.8, label: "ESP-WROOM-32" });
    expect((solids[0] as Box).id).toBe("module");
    expect(
      solids.some((s) => s.kind === "box" && s.id === "shield" && s.label?.text === "ESP-WROOM-32"),
    ).toBe(true);
    expect(solids.some((s) => s.kind === "path")).toBe(true);
    expect(shieldCan({ x: 0, y: 0, w: 12, h: 12, label: "ESP8266" })).toMatchObject({
      id: "shield",
      finish: "metal",
    });
  });

  it("a crystal shows its frequency, a regulator its part number", () => {
    expect((crystal({ x: 0, y: 0 }) as Box).label?.text).toBe("16.000");
    expect((sot223(0, 0)[0] as Box).label?.text).toBe("1117");
    expect((sot223(0, 0, "AMS1117")[0] as Box).label?.text).toBe("AMS1117");
  });
});
