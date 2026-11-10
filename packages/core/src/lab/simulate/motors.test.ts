import { wired } from "../../../test/support/lab";
import { describe, expect, it } from "vitest";
import { analyze } from "../circuit";
import { planAutoWire } from "../autowire";
import { coerceInput, findControl } from "../controls";
import { DC_MOTOR_MAX_RPM, frameAt } from "./";
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

describe("P1 · Experiment 04: PIR gate", () => {
  it("none → detected → detected → none, twice, then Stop and Run: LED and servo follow, and never drift", () => {
    const { parts, at } = build("arduino-uno", "pir", "servo", "led");
    const step = (t: number, motion: boolean, running = true) => {
      const f = at(t, set(parts.pir!.id, { motion }), running);
      return {
        motion: reading(f, parts.pir!.id, "Motion") ?? "—",
        led: f.nodes[parts.led!.id]!.on,
        angle: f.nodes[parts.servo!.id]!.angle,
      };
    };
    const sequence: Array<[boolean, { motion: string; led: boolean; angle: number }]> = [
      [false, { motion: "None", led: false, angle: 0 }],
      [true, { motion: "Detected", led: true, angle: 90 }],
      [true, { motion: "Detected", led: true, angle: 90 }],
      [false, { motion: "None", led: false, angle: 0 }],
    ];
    let t = 0;
    for (let round = 0; round < 2; round++) {
      for (const [motion, expected] of sequence) {
        // Hold each state for 5 s, sampled every 0.5 s: nothing oscillates.
        for (let k = 0; k < 10; k++, t += 0.5) expect(step(t, motion)).toEqual(expected);
      }
    }
    // Stop: the servo holds where the sketch left it; Run again: same outputs as before.
    expect(step(t, true, false)).toMatchObject({ led: false, angle: 90 });
    expect(step(t + 0.1, true)).toEqual({ motion: "Detected", led: true, angle: 90 });
  });

  it("the servo stays within 0–180°, whatever the gate settings", () => {
    const c = findControl("arduino-uno", "gateOpen")!;
    expect([coerceInput(c, -20), coerceInput(c, 270)]).toEqual([0, 180]);
  });
});

describe("P1 · Experiment 05: DC motor", () => {
  const rows: Array<[string, number, "forward" | "reverse", number, string]> = [
    ["DC-01", 0, "forward", 0, "Stopped"],
    ["DC-02", 25, "forward", 35, "Forward"],
    ["DC-03", 50, "forward", 70, "Forward"],
    ["DC-04", 75, "forward", 105, "Forward"],
    ["DC-05", 75, "reverse", 105, "Reverse"],
    ["DC-06", 0, "reverse", 0, "Stopped"],
  ];
  for (const [id, speed, direction, rpm, dir] of rows) {
    it(`${id}: ${speed} % ${direction} → ${rpm} rpm, ${dir}`, () => {
      const { parts, at } = build("arduino-uno", "dc-motor");
      const m = parts["dc-motor"]!.id;
      const f = at(2, set(m, { speed, direction }));
      expect(reading(f, m, "Speed")).toBe(`${rpm} rpm`);
      expect(reading(f, m, "Direction")).toBe(dir);
      expect(f.nodes[m]!.level).toBeCloseTo(speed / 100, 6);
      expect(f.pins[`${m}:EN`]).toBeCloseTo(speed / 100, 6);
      expect(rpm).toBe(Math.round((speed / 100) * DC_MOTOR_MAX_RPM));
    });
  }

  it("DC-07: 50 % forward then reverse switches IN1/IN2 and turns the shaft the other way", () => {
    const { parts, at } = build("arduino-uno", "dc-motor");
    const m = parts["dc-motor"]!.id;
    const fwd = (t: number) => at(t, set(m, { speed: 50, direction: "forward" }));
    const rev = (t: number) => at(t, set(m, { speed: 50, direction: "reverse" }));
    expect([fwd(1).pins[`${m}:IN1`], fwd(1).pins[`${m}:IN2`]]).toEqual([1, 0]);
    expect([rev(1).pins[`${m}:IN1`], rev(1).pins[`${m}:IN2`]]).toEqual([0, 1]);
    const delta = (f: (t: number) => ReturnType<typeof frameAt>) =>
      ((((f(1.01).nodes[m]!.angle! - f(1).nodes[m]!.angle!) % 360) + 540) % 360) - 180;
    expect(delta(fwd)).toBeGreaterThan(0);
    expect(delta(rev)).toBeLessThan(0);
  });

  it("DC-08: speed 0, or Stop, halts it and it stays halted; the same setting gives the same speed on every run", () => {
    const { parts, at } = build("arduino-uno", "dc-motor");
    const m = parts["dc-motor"]!.id;
    for (let t = 0; t < 10; t += 1)
      expect(reading(at(t, set(m, { speed: 0 })), m, "Speed")).toBe("0 rpm");
    for (let t = 0; t < 10; t += 1)
      expect(at(t, set(m, { speed: 80 }), false).nodes[m]!.on).toBe(false);
    const speeds = [1, 5, 50, 500].map((t) => reading(at(t, set(m, { speed: 60 })), m, "Speed"));
    expect(new Set(speeds)).toEqual(new Set(["84 rpm"]));
  });
});

describe("motors in every mode", () => {
  const value = (live: { readings: Array<{ label: string; value: string }> }, label: string) =>
    live.readings.find((r) => r.label === label)?.value;

  it("a servo sweeps on its own, holds an angle set, and rests at 90° when stopped", () => {
    const { at } = wired("arduino-uno", "servo");
    const sweep = at(1).nodes.servo!;
    expect(value(sweep, "Command")).toBe("Sweep (simulated)");
    expect(sweep.angle).toBeGreaterThan(15);
    const held = at(1, { inputs: { servo: { source: "set", angle: 200 } } }).nodes.servo!;
    expect(held.angle).toBe(180);
    expect(value(held, "Command")).toBe("Hold 180°");
    expect(at(1, { running: false }).nodes.servo).toMatchObject({
      angle: 90,
      on: false,
      readings: [{ label: "Angle", value: "90°" }],
    });
    expect(
      at(1, { running: false, inputs: { servo: { source: "set", angle: 45 } } }).nodes.servo!.angle,
    ).toBe(45);
  });

  it("a servo with a PIR on its board is the gate: open on motion, at rest without", () => {
    const { at } = wired("arduino-uno", "pir", "servo");
    const open = at(1, {
      inputs: { pir: { source: "set", motion: true }, board: { gateOpen: 120, gateRest: 10 } },
    }).nodes.servo!;
    expect(open.angle).toBe(120);
    expect(value(open, "Command")).toBe("Open (120°): motion seen");
    const rest = at(1, {
      inputs: { pir: { source: "set", motion: false }, board: { gateOpen: 120, gateRest: 10 } },
    }).nodes.servo!;
    expect(value(rest, "Command")).toBe("Rest (10°): no motion");
  });

  it("a DC motor: varying on its own, at the speed and direction set, stopped when stopped", () => {
    const { at } = wired("arduino-uno", "dc-motor");
    expect(value(at(1).nodes["dc-motor"]!, "Command")).toBe("Varying (simulated)");
    const back = at(1, {
      inputs: { "dc-motor": { source: "set", speed: 50, direction: "reverse" } },
    }).nodes["dc-motor"]!;
    expect(back).toMatchObject({ level: 0.5, badge: "70 rpm" });
    expect(value(back, "Direction")).toBe("Reverse");
    expect(value(back, "Command")).toBe("50 % reverse");
    const stopped = at(1, { running: false, inputs: { "dc-motor": { source: "set", speed: 50 } } })
      .nodes["dc-motor"]!;
    expect(stopped).toMatchObject({ on: false, badge: "Stopped" });
    expect(value(stopped, "Direction")).toBe("Stopped");
  });

  it("a DC motor driver missing its direction or enable pin says why it can't do as set", () => {
    const built = wired("arduino-uno", "dc-motor");
    const run = (
      wires: typeof built.wires,
      inputs: Record<string, Record<string, string | number>>,
    ) => {
      const analysis = analyze(built.nodes, wires, inputs);
      return frameAt({ nodes: built.nodes, wires, analysis, t: 1, running: true, inputs }).nodes[
        "dc-motor"
      ]!;
    };
    const noIn1 = run(built.without("IN1", "dc-motor"), {
      "dc-motor": { source: "set", speed: 80, direction: "forward" },
    });
    expect(value(noIn1, "Note")).toBe("IN1 isn't wired, so the driver can't turn forward");
    expect(noIn1.level).toBe(0);
    const noEn = run(built.without("EN", "dc-motor"), { "dc-motor": { source: "set", speed: 30 } });
    expect(value(noEn, "Note")).toBe("EN isn't wired: full speed or stopped");
    expect(noEn.level).toBe(1);
    expect(run(built.without("EN", "dc-motor"), {}).level).toBe(1); // no PWM: full speed
  });

  it("a stepper: turning on its own, moving to a target set and holding there, with its last move", () => {
    const { at } = wired("arduino-uno", "stepper-motor");
    const free = at(2).nodes["stepper-motor"]!;
    expect(value(free, "Command")).toBe("Turning (simulated)");
    expect(value(free, "Position (steps)")).toBe("256");
    const cmd = {
      source: "set",
      cmdFrom: 0,
      cmdStart: 0,
      cmdTarget: 512,
      cmdGoal: 512,
      cmdAt: 0,
      stepsPerSecond: 256,
    };
    const moving = at(1, { inputs: { "stepper-motor": cmd } }).nodes["stepper-motor"]!;
    expect(value(moving, "Command")).toBe("256 steps to go clockwise");
    expect(value(moving, "Last move")).toBe("+512 steps");
    expect(value(moving, "Done")).toBe("256 of 512");
    const done = at(5, { inputs: { "stepper-motor": cmd } }).nodes["stepper-motor"]!;
    expect(value(done, "Command")).toBe("Holding");
    expect(done.on).toBe(false);
    const halted = at(5, { inputs: { "stepper-motor": { ...cmd, cmdTarget: 300 } } }).nodes[
      "stepper-motor"
    ]!;
    expect(value(halted, "Done")).toBe("300 of 512, stopped");
    const back = at(1, { inputs: { "stepper-motor": { ...cmd, cmdTarget: -512, cmdGoal: -512 } } })
      .nodes["stepper-motor"]!;
    expect(value(back, "Command")).toBe("256 steps to go anticlockwise");
    expect(value(back, "Last move")).toBe("−512 steps");
    expect(at(1, { running: false }).nodes["stepper-motor"]!.readings.map((r) => r.label)).toEqual([
      "Position",
      "Position (steps)",
    ]);
  });
});
