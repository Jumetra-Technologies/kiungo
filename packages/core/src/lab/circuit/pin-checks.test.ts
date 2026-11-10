import { describe, expect, it } from "vitest";
import { circuit, faultKeys, part } from "../../../test/support/circuit";

const uno = part("uno", "arduino-uno");
const esp = part("esp", "esp32");

describe("supply, ground and drive pins", () => {
  it("too much voltage on a 3.3 V part, too little on a 5 V one", () => {
    const over = circuit([uno, part("r", "nrf24l01")], ["uno.5V>r.VCC", "uno.GND1>r.GND"]).analysis;
    expect(over.nodes.r!.faults.find((f) => f.id === "over:VCC:r")).toMatchObject({
      severity: "error",
      title: "5 V on a 3.6 V part",
    });
    const under = circuit(
      [uno, part("lcd", "lcd-16x2")],
      ["uno.3V3>lcd.VCC", "uno.GND1>lcd.GND"],
    ).analysis;
    expect(under.nodes.lcd!.faults.find((f) => f.id === "under:VCC:lcd")?.severity).toBe("warning");
  });

  it("a part powered from a GPIO pin runs, with a warning; a supply on ground doesn't", () => {
    const gpio = circuit(
      [uno, part("d", "dht11")],
      ["uno.D2>d.VCC", "uno.GND1>d.GND", "uno.D3>d.DATA"],
    ).analysis;
    expect(faultKeys(gpio, "d")).toContain("gpio-power:VCC");
    expect(gpio.nodes.d!.supplyV).toBe(5);
    const grounded = circuit(
      [uno, part("d", "dht11")],
      ["uno.GND1>d.VCC", "uno.GND2>d.GND"],
    ).analysis;
    expect(faultKeys(grounded, "d")).toContain("vcc-gnd:VCC");
    expect(faultKeys(grounded, "d")).not.toContain("no-power"); // the one fault says it
  });

  it("a ground pin on a supply rail", () => {
    const a = circuit([uno, part("d", "dht11")], ["uno.5V>d.GND", "uno.3V3>d.VCC"]).analysis;
    expect(faultKeys(a, "d")).toContain("gnd-vcc:GND");
  });

  it("an LED always on from a rail, or held off on ground", () => {
    const on = circuit([uno, part("l", "led")], ["uno.5V>l.A", "uno.GND1>l.C"]).analysis;
    expect(on.nodes.l!.faults.find((f) => f.id === "always-on:A:l")?.severity).toBe("tip");
    expect(on.nodes.l!.powered).toBe(true);
    const off = circuit([uno, part("l", "led")], ["uno.GND2>l.A", "uno.GND1>l.C"]).analysis;
    expect(faultKeys(off, "l")).toContain("held-low:A");
  });

  it("outputs on an input-only pin, PWM on a pin without it, 5 V into a 3.3 V part", () => {
    const inOnly = circuit([esp, part("l", "led")], ["esp.D34>l.A", "esp.GND1>l.C"]).analysis;
    expect(faultKeys(inOnly, "l")).toContain("input-only:A");
    const noPwm = circuit(
      [uno, part("s", "servo")],
      ["uno.5V>s.VCC", "uno.GND1>s.GND", "uno.D2>s.SIG"],
    ).analysis;
    expect(faultKeys(noPwm, "s")).toContain("no-pwm:SIG");
    const level = circuit(
      [uno, part("lo", "lora")],
      ["uno.3V3>lo.VCC", "uno.GND1>lo.GND", "uno.D10>lo.NSS"],
    ).analysis;
    expect(lo(level)).toContain("level-in:NSS");
  });

  it("a required drive pin left unwired on a part that is otherwise wired", () => {
    const a = circuit([uno, part("rel", "relay")], ["uno.5V>rel.VCC", "uno.GND1>rel.GND"]).analysis;
    expect(a.nodes.rel!.faults.find((f) => f.id === "unwired:IN:rel")).toMatchObject({
      severity: "error",
      title: "IN isn't connected",
    });
  });
});

const lo = (a: Parameters<typeof faultKeys>[0]) => faultKeys(a, "lo");
