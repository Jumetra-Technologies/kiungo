import { describe, expect, it } from "vitest";
import { analyze } from "../circuit";
import { planAutoWire } from "../autowire";
import { frameAt, serialLine } from "./";
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

const autowired = (boardId: string, partId: string) => {
  const board = node(boardId, 0, 0, "Board");
  const part = node(partId, 500, 0, "Part");
  const plan = planAutoWire(part, [board, part], []);
  const wires = plan.wires.map((w) => ({ id: `w${++seq}`, ...w }));
  return { board, part, wires, plan, analysis: analyze([board, part], wires) };
};

describe("simulation", () => {
  it("blinks an LED wired to a board once a second, and only while running", () => {
    const { board, part, wires, analysis } = autowired("arduino-uno", "led");
    const nodes = [board, part];
    expect(frameAt({ nodes, wires, analysis, t: 0.2, running: true }).nodes[part.id]!.on).toBe(
      true,
    );
    expect(frameAt({ nodes, wires, analysis, t: 0.7, running: true }).nodes[part.id]!.on).toBe(
      false,
    );
    expect(frameAt({ nodes, wires, analysis, t: 0.2, running: false }).nodes[part.id]!.on).toBe(
      false,
    );
    const frame = frameAt({ nodes, wires, analysis, t: 0.2, running: true });
    const anode = wires.find((w) => w.to.pin === "A")!;
    const gnd = wires.find((w) => w.to.pin === "C")!;
    expect(frame.wires[anode.id]).toMatchObject({ flow: "signal", level: 1 });
    expect(frame.wires[gnd.id]).toMatchObject({ flow: "ground", level: 1 });
  });

  it("reads sensors, shows readings on displays and prints them on serial", () => {
    const esp = node("esp32", 0, 0, "ESP32");
    const dht = node("dht22", 500, 0, "DHT22");
    const oled = node("oled-ssd1306", 500, 300, "OLED");
    const plan1 = planAutoWire(dht, [esp, dht, oled], []).wires.map((w) => ({
      id: `w${++seq}`,
      ...w,
    }));
    const plan2 = planAutoWire(oled, [esp, dht, oled], plan1).wires.map((w) => ({
      id: `w${++seq}`,
      ...w,
    }));
    const wires = [...plan1, ...plan2];
    const analysis = analyze([esp, dht, oled], wires);
    const frame = frameAt({ nodes: [esp, dht, oled], wires, analysis, t: 3, running: true });
    expect(frame.nodes[dht.id]!.readings[0]!.label).toBe("Temperature");
    // The display shows the sensor's readings as the sketch formats them, one per line.
    expect(frame.nodes[oled.id]!.text?.[0]).toMatch(/^Temp: \d+\.\d °C$/);
    expect(frame.nodes[oled.id]!.text?.[1]).toMatch(/^Hum: \d+ %$/);
    expect(serialLine([esp, dht, oled], frame)).toMatch(/^\[3\.0s\] DHT22: .* °C/);
  });

  it("keeps a part dark when it has no ground", () => {
    const uno = node("arduino-uno");
    const buzzer = node("buzzer");
    const wires = [wire(uno, "D8", buzzer, "P")];
    const analysis = analyze([uno, buzzer], wires);
    expect(
      frameAt({ nodes: [uno, buzzer], wires, analysis, t: 0.05, running: true }).nodes[buzzer.id]!
        .on,
    ).toBe(false);
  });
});
