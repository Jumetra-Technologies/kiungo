import { describe, expect, it } from "vitest";
import { PARTS } from "../../parts";
import { PINOUTS, getPin, getPinout, hasPinout, pinTone, type LabPin } from "./";

describe("pinouts", () => {
  it("covers every catalogue part with unique pin ids", () => {
    for (const part of PARTS) {
      expect(hasPinout(part.id), part.id).toBe(true);
      const ids = getPinout(part.id).pins.map((p) => p.id);
      expect(new Set(ids).size, part.id).toBe(ids.length);
    }
    expect(PINOUTS).toHaveLength(PARTS.length);
  });

  it("gives every board a supply and a ground, every peripheral a role per pin, and every breadboard hole a strip", () => {
    for (const pinout of PINOUTS) {
      if (pinout.passive && !pinout.strips) {
        // A resistor: two legs, no polarity, nothing joined inside.
        expect(
          pinout.pins.map((p) => p.id),
          pinout.partId,
        ).toEqual(["1", "2"]);
      } else if (pinout.passive) {
        const inStrips = new Set(pinout.strips!.flat());
        expect(
          pinout.pins.every((p) => inStrips.has(p.id)),
          pinout.partId,
        ).toBe(true);
      } else if (pinout.controller) {
        expect(
          pinout.pins.some((p) => p.supplies),
          pinout.partId,
        ).toBe(true);
        expect(
          pinout.pins.some((p) => p.fns?.includes("ground")),
          pinout.partId,
        ).toBe(true);
      } else {
        expect(
          pinout.pins.every((p) => p.role),
          pinout.partId,
        ).toBe(true);
        expect(pinout.supply, pinout.partId).toBeDefined();
      }
    }
  });
});

describe("the colour each pin is drawn in", () => {
  const pin = (over: Partial<LabPin>): LabPin => ({ id: "P", label: "P", ...over }) as LabPin;
  it("names power, ground, optional and analog pins by their role", () => {
    expect(pinTone(pin({ role: "vcc" }))).toBe("power");
    expect(pinTone(pin({ fns: ["power"] }))).toBe("power");
    expect(pinTone(pin({ role: "gnd" }))).toBe("ground");
    expect(pinTone(pin({ fns: ["ground"] }))).toBe("ground");
    expect(pinTone(pin({ role: "opt" }))).toBe("muted");
    expect(pinTone(pin({ role: "load" }))).toBe("muted");
    expect(pinTone(pin({ role: "out-analog" }))).toBe("analog");
    expect(pinTone(pin({ role: "pwm" }))).toBe("pwm");
    for (const role of ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"] as const)
      expect(pinTone(pin({ role })), role).toBe("bus");
  });

  it("names a board pin by the most specific thing it can do", () => {
    expect(pinTone(pin({ fns: ["digital", "pwm", "sck"] }))).toBe("bus");
    expect(pinTone(pin({ fns: ["digital", "pwm"] }))).toBe("pwm");
    expect(pinTone(pin({ fns: ["digital", "analog"] }))).toBe("analog");
    expect(pinTone(pin({ fns: ["digital"] }))).toBe("digital");
    expect(pinTone(pin({}))).toBe("digital");
    expect(getPin("arduino-uno", "D13")?.label).toBe("D13 SCK");
    expect(getPin("arduino-uno", "nope")).toBeUndefined();
  });

  it("gives a part it doesn't know a generic three-pin pinout under its own id", () => {
    expect(hasPinout("mystery")).toBe(false);
    expect(getPinout("mystery")).toMatchObject({ partId: "mystery", controller: false });
    expect(getPinout("mystery").pins.map((p) => p.id)).toEqual(["VCC", "GND", "SIG"]);
  });
});
