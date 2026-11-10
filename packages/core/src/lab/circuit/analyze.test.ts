import { describe, expect, it } from "vitest";
import { analyze } from "./";
import type { LabNode, LabWire } from "../types";

let seq = 0;

const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({
  id: `n${++seq}`,
  partId,
  label: label ?? partId,
  x,
  y,
  mode: "virtual",
});

const wire = (a: LabNode, ap: string, b: LabNode, bp: string): LabWire => ({
  id: `w${++seq}`,
  from: { node: a.id, pin: ap },
  to: { node: b.id, pin: bp },
});

describe("circuit analysis", () => {
  it("finds a missing ground and a missing supply", () => {
    const uno = node("arduino-uno");
    const led = node("led");
    const a = analyze([uno, led], [wire(uno, "D13", led, "A")]);
    expect(a.nodes[led.id]!.status).toBe("fault");
    expect(a.nodes[led.id]!.faults.map((f) => f.title)).toContain("No path to ground");

    const dht = node("dht11");
    const b = analyze([uno, dht], [wire(uno, "D2", dht, "DATA"), wire(uno, "GND1", dht, "GND")]);
    expect(b.nodes[dht.id]!.faults.map((f) => f.title)).toContain("No power");
  });

  it("flags a short from a supply to ground", () => {
    const uno = node("arduino-uno");
    const a = analyze([uno], [wire(uno, "5V", uno, "GND1")]);
    expect(a.faults[0]).toMatchObject({
      severity: "error",
      title: expect.stringContaining("Short circuit"),
    });
    expect(a.nodes[uno.id]!.powered).toBe(false);
  });

  it("flags too much voltage on a 3.3 V part", () => {
    const uno = node("arduino-uno");
    const radio = node("nrf24l01");
    const a = analyze(
      [uno, radio],
      [wire(uno, "5V", radio, "VCC"), wire(uno, "GND1", radio, "GND")],
    );
    expect(a.nodes[radio.id]!.faults.find((f) => f.title.includes("3.6 V part"))?.severity).toBe(
      "error",
    );
  });

  it("flags swapped I²C lines and TX wired to TX", () => {
    const uno = node("arduino-uno");
    const lcd = node("lcd-16x2");
    const a = analyze(
      [uno, lcd],
      [
        wire(uno, "5V", lcd, "VCC"),
        wire(uno, "GND1", lcd, "GND"),
        wire(uno, "A5", lcd, "SDA"),
        wire(uno, "A4", lcd, "SCL"),
      ],
    );
    expect(a.faults.filter((f) => f.title === "SDA and SCL swapped")).toHaveLength(2);

    const pi = node("raspberry-pi-4");
    const b = analyze([uno, pi], [wire(uno, "D1", pi, "GPIO14"), wire(uno, "GND1", pi, "GND1")]);
    expect(b.faults.map((f) => f.title)).toContain("TX wired to TX");
    // And the Uno's 5 V TX would hurt the Pi's 3.3 V pin.
    expect(b.faults.map((f) => f.title)).toContain("5 V signal into a 3.3 V board");
  });

  it("asks for a common ground between boards that talk", () => {
    const uno = node("arduino-uno");
    const pi = node("raspberry-pi-4");
    const a = analyze([uno, pi], [wire(uno, "D2", pi, "GPIO4")]);
    expect(a.faults.map((f) => f.title)).toContain("No common ground between boards");
    expect(a.boardLinks[0]).toMatchObject({ a: uno.id, b: pi.id, bus: "gpio" });
  });

  it("knows input-only pins can't drive an LED, and digital pins can't read analog", () => {
    const esp = node("esp32");
    const led = node("led");
    const a = analyze([esp, led], [wire(esp, "D34", led, "A"), wire(esp, "GND1", led, "C")]);
    expect(a.nodes[led.id]!.faults.map((f) => f.title)).toContain("GPIO34 can't drive outputs");

    const uno = node("arduino-uno");
    const ldr = node("ldr");
    const b = analyze([uno, ldr], [wire(uno, "5V", ldr, "L1"), wire(uno, "D7", ldr, "L2")]);
    expect(b.nodes[ldr.id]!.faults.map((f) => f.title)).toContain("D7 can't read analog");
    expect(b.nodes[ldr.id]!.status).toBe("ready");
  });

  it("joins a board's grounds and its same-voltage supply pins into single nets", () => {
    const uno = node("arduino-uno");
    const a = analyze([uno], []);
    const net = (pin: string) => a.netOfPin.get(`${uno.id}:${pin}`);
    expect(net("GND1")).toBe(net("GND3"));
    expect(net("5V")).toBe(net("5V_ICSP"));
    expect(net("5V")).not.toBe(net("3V3"));
  });
});
