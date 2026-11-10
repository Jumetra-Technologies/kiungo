import { describe, expect, it } from "vitest";
import { analyze } from "../circuit";
import { planAutoWire } from "../autowire";
import { coerceInput, findControl } from "../controls";
import { frameAt } from "./";
import type { LabNode, LabWire, NodeInputs } from "../types";

let seq = 0;

const node = (partId: string, x = 0, y = 0): LabNode => ({
  id: `q${++seq}`,
  partId,
  label: partId === "dht11" ? "DHT11" : partId,
  x,
  y,
  mode: "virtual",
});

function build(boardId: string, ...peripherals: string[]) {
  const board = node(boardId);
  const nodes = [board];
  let wires: LabWire[] = [];
  const parts: Record<string, LabNode> = {};
  for (const p of peripherals) {
    const n = node(p, 600, nodes.length * 200);
    nodes.push(n);
    parts[p] = n;
    wires = [
      ...wires,
      ...planAutoWire(n, nodes, wires).wires.map((w) => ({ id: `w${++seq}`, ...w })),
    ];
  }
  const analysis = analyze(nodes, wires);
  const at = (t: number, inputs?: Record<string, NodeInputs>, running = true) =>
    frameAt({ nodes, wires, analysis, t, running, inputs });
  return { board, parts, nodes, wires, analysis, at };
}

const set = (nodeId: string, values: NodeInputs): Record<string, NodeInputs> => ({
  [nodeId]: { source: "set", ...values },
});

const reading = (f: ReturnType<typeof frameAt>, id: string, label: string) =>
  f.nodes[id]!.readings.find((r) => r.label === label)?.value;

describe("P1 · Experiment 02: ultrasonic warning", () => {
  it("19 cm warns; 20 cm (equal) and 21 cm don't: the rule is distance < Warning distance", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const state = (distanceCm: number) => {
      const f = at(3, set(parts["hc-sr04"]!.id, { distanceCm }));
      return {
        shown: reading(f, parts["hc-sr04"]!.id, "Distance"),
        led: f.nodes[parts.led!.id]!.on,
        beeping: !!f.nodes[parts.buzzer!.id]!.tone,
      };
    };
    expect(state(19)).toEqual({ shown: "19.0 cm", led: true, beeping: true });
    expect(state(20)).toEqual({ shown: "20.0 cm", led: false, beeping: false });
    expect(state(21)).toEqual({ shown: "21.0 cm", led: false, beeping: false });
  });

  it("handles the range ends and rejects what isn't a number", () => {
    const c = findControl("hc-sr04", "distanceCm")!;
    expect([
      coerceInput(c, 2),
      coerceInput(c, 400),
      coerceInput(c, 0),
      coerceInput(c, 999),
    ]).toEqual([2, 400, 2, 400]);
    expect(coerceInput(c, Number.NaN)).toBeNull();
    expect(coerceInput(c, "abc")).toBeNull();
    const { parts, at } = build("arduino-uno", "hc-sr04", "led");
    expect(at(1, set(parts["hc-sr04"]!.id, { distanceCm: 2 })).nodes[parts.led!.id]!.on).toBe(true);
    expect(at(1, set(parts["hc-sr04"]!.id, { distanceCm: 400 })).nodes[parts.led!.id]!.on).toBe(
      false,
    );
  });

  it("the buzzer is an active buzzer beeping 150 ms on / 150 ms off while the warning holds; the LED stays steadily on", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const near = set(parts["hc-sr04"]!.id, { distanceCm: 10 });
    expect(at(1, near).nodes[parts.buzzer!.id]!.tone).toEqual({
      hz: 2300,
      pattern: { period: 0.3, duty: 0.5, phase: 0 },
    });
    for (let t = 1; t < 4; t += 0.05) expect(at(t, near).nodes[parts.led!.id]!.on).toBe(true);
  });

  it("is steady while the input doesn't change, repeatable across the threshold, and clean after Stop → Run", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const led = (t: number, distanceCm: number, running = true) =>
      at(t, set(parts["hc-sr04"]!.id, { distanceCm }), running).nodes[parts.led!.id]!.on;
    for (const [d, on] of [
      [30, false],
      [10, true],
      [30, false],
      [10, true],
    ] as const)
      for (let t = 0; t < 3; t += 0.25) expect(led(t, d)).toBe(on);
    expect(led(3, 10, false)).toBe(false);
    expect(
      at(3, set(parts["hc-sr04"]!.id, { distanceCm: 10 }), false).nodes[parts.buzzer!.id]!.tone,
    ).toBeNull();
    expect(led(3.1, 10)).toBe(true);
  });
});
