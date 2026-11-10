import { wired } from "../../test/support/lab";
import { describe, expect, it } from "vitest";
import { analyze } from "./circuit";
import { planAutoWire } from "./autowire";
import { frameAt } from "./simulate";
import { describeChanges, RunRecorder } from "./activity";
import type { LabNode, LabWire } from "./types";

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

describe("activity log", () => {
  it("records parts becoming ready, board links, and faults found then fixed", () => {
    const uno = node("arduino-uno", 0, 0, "Uno");
    const led = node("led", 500, 0, "LED");
    const pi = node("raspberry-pi-4", 0, 400, "Pi");
    const half = [wire(uno, "D13", led, "A")];
    const a1 = analyze([uno, led, pi], half);
    const full = [...half, wire(uno, "GND3", led, "C")];
    const a2 = analyze([uno, led, pi], full);
    const texts = describeChanges(a1, a2, [uno, led, pi]).map((d) => d.text);
    expect(texts).toContain("LED is wired and powered on Uno D13 SCK");
    expect(texts.some((t) => t.startsWith("Fixed on LED: No path to ground"))).toBe(true);

    const linked = [...full, wire(uno, "D2", pi, "GPIO17"), wire(uno, "GND1", pi, "GND1")];
    const a3 = analyze([uno, led, pi], linked);
    expect(describeChanges(a2, a3, [uno, led, pi]).map((d) => d.text)).toContain(
      "Uno connected to Pi over a GPIO line",
    );
  });

  it("writes up a run: first moments, then a summary", () => {
    const { board, part, wires, analysis } = autowired("arduino-uno", "led");
    const rec = new RunRecorder([board, part]);
    rec.start(0);
    const first: string[] = [];
    for (let i = 0; i <= 30; i++)
      first.push(
        ...rec
          .frame(
            frameAt({ nodes: [board, part], wires, analysis, t: i / 10, running: true }),
            analysis,
          )
          .map((d) => d.text),
      );
    expect(first).toEqual(["Part flashes on (Board D13 SCK)"]);
    const { draft, ms } = rec.stop();
    expect(draft.text).toMatch(/^Run stopped after 3\.0 s: Part flashed [34] times$/);
    expect(ms).toBe(3000);
  });
});

describe("the run write-up for every kind of part", () => {
  /** Records a run of `parts` on an Uno, frame by frame, and writes it up. */
  function record(
    parts: string[],
    seconds: number,
    inputs?: Record<string, Record<string, string | number | boolean>>,
  ) {
    const { nodes, wires } = wired("arduino-uno", ...parts);
    const analysis = analyze(nodes, wires, inputs);
    const recorder = new RunRecorder(nodes);
    recorder.start(0);
    const lines: string[] = [];
    for (let t = 0; t <= seconds; t += 0.05) {
      const frame = frameAt({ nodes, wires, analysis, t, running: true, inputs });
      lines.push(...recorder.frame(frame, analysis).map((d) => d.text));
    }
    return { lines, summary: recorder.stop() };
  }

  it("says how each part first comes alive, and on which board pin", () => {
    const { lines } = record(
      [
        "led",
        "buzzer",
        "relay",
        "rgb-led",
        "servo",
        "dc-motor",
        "stepper-motor",
        "lcd-16x2",
        "hc-05",
        "dht11",
      ],
      3,
    );
    const first = (part: string) => lines.find((l) => l.startsWith(`${part} `));
    expect(first("led")).toMatch(/^led flashes on \(Board D13 SCK\)$/);
    expect(first("buzzer")).toMatch(/^buzzer beeps/);
    expect(first("relay")).toMatch(/^relay clicks: COM switches to NO/);
    expect(first("rgb-led")).toMatch(/^rgb-led starts fading through colors/);
    expect(first("servo")).toMatch(/^servo moves to \d+°/);
    expect(first("dc-motor")).toMatch(/^dc-motor spins up to \d+ rpm/);
    expect(first("stepper-motor")).toMatch(/^stepper-motor starts stepping/);
    expect(first("lcd-16x2")).toMatch(/^lcd-16x2 shows “/);
    expect(first("hc-05")).toMatch(/^hc-05 comes up: /);
    expect(first("dht11")).toMatch(/^dht11 reads \d/);
  });

  it("sums the run up: ranges for readings, counts for switching, and parts that stayed off", () => {
    const { summary } = record(["led", "dht11"], 3);
    expect(summary.ms).toBeCloseTo(3000, -2);
    expect(summary.draft.text).toMatch(/^Run stopped after 3\.0 s: /);
    expect(summary.draft.text).toMatch(/led flashed \d+ times/);
    expect(summary.draft.text).toMatch(/dht11 temperature \d+\.\d–\d+\.\d °C/);
    const pir = record(["pir"], 20, { pir: { source: "set", motion: false } });
    expect(pir.summary.draft.text).toMatch(/pir stayed off|pir/);
  });

  it("names how each kind of part switched", () => {
    const { summary } = record(["buzzer", "relay"], 9);
    expect(summary.draft.text).toMatch(/buzzer beeped \d+ times/);
    expect(summary.draft.text).toMatch(/relay switched \d+ times/);
    const pir = record(["pir"], 20);
    expect(pir.summary.draft.text).toMatch(/pir (saw motion \d+ times|came on)/);
  });

  it("a run with nothing to say is just its length", () => {
    const empty = new RunRecorder([]);
    empty.start(1);
    expect(empty.stop()).toEqual({
      draft: { kind: "run", text: "Run stopped after 0.0 s" },
      ms: 0,
    });
    empty.setNodes([]);
  });
});

describe("milestones from one analysis to the next", () => {
  it("boards linked over each bus, once", () => {
    const uno = {
      id: "u",
      partId: "arduino-uno",
      label: "Uno",
      x: 0,
      y: 0,
      mode: "virtual" as const,
    };
    const esp = { id: "e", partId: "esp32", label: "ESP32", x: 0, y: 0, mode: "virtual" as const };
    const before = analyze([uno, esp], []);
    const w = (a: string, b: string, id: string) => ({
      id,
      from: { node: "u", pin: a },
      to: { node: "e", pin: b },
    });
    const after = analyze(
      [uno, esp],
      [w("A4", "D21", "1"), w("GND1", "GND1", "2"), w("D1", "RX", "3")],
    );
    const drafts = describeChanges(before, after, [uno, esp]).filter((d) => d.kind === "wire");
    expect(drafts.map((d) => d.text)).toEqual([
      "Uno connected to ESP32 over I²C",
      "Uno connected to ESP32 over UART",
    ]);
    expect(describeChanges(after, after, [uno, esp])).toEqual([]);
    expect(describeChanges(null, after, [uno, esp])).toEqual([]);
  });

  it("faults found and fixed, but not ones that left with their part", () => {
    const uno = {
      id: "u",
      partId: "arduino-uno",
      label: "Uno",
      x: 0,
      y: 0,
      mode: "virtual" as const,
    };
    const led = { id: "l", partId: "led", label: "LED", x: 0, y: 0, mode: "virtual" as const };
    const ungrounded = analyze(
      [uno, led],
      [{ id: "1", from: { node: "u", pin: "D13" }, to: { node: "l", pin: "A" } }],
    );
    const fixed = analyze(
      [uno, led],
      [
        { id: "1", from: { node: "u", pin: "D13" }, to: { node: "l", pin: "A" } },
        { id: "2", from: { node: "u", pin: "GND1" }, to: { node: "l", pin: "C" } },
      ],
    );
    expect(
      describeChanges(analyze([uno, led], []), ungrounded, [uno, led]).map((d) => d.text),
    ).toContain("Fault on LED: No path to ground");
    expect(describeChanges(ungrounded, fixed, [uno, led]).map((d) => d.text)).toEqual(
      expect.arrayContaining([
        "Fixed on LED: No path to ground",
        "LED is wired and powered on Uno D13 SCK",
      ]),
    );
    expect(
      describeChanges(ungrounded, analyze([uno], []), [uno]).filter((d) => d.kind === "fix"),
    ).toEqual([]);
  });
});
