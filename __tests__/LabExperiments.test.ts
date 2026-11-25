/**
 * The five Engineering Lab experiments from the QA brief, on a deterministic
 * clock. Every frame is sampled with frameAt(), a pure function, so nothing
 * here depends on real time or random values.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { analyze, type Analysis } from "@kiungo/core/lab/circuit";
import { planAutoWire } from "@kiungo/core/lab/autowire";
import { controlsFor, coerceInput, findControl } from "@kiungo/core/lab/controls";
import { DC_MOTOR_MAX_RPM, STEPPER_STEPS_PER_TURN, frameAt, stepperStepsAt } from "@kiungo/core/lab/simulate";
import { displayLines, sampleSensor, boardSettings } from "@kiungo/core/lab/sketch";
import { labKeyFor, readLabData, useLab } from "@kiungo/lab/store";
import { freshLab } from "./helpers/lab";
import type { LabNode, LabWire, NodeInputs } from "@kiungo/core/lab/types";
import { getPart, hasScreen, withScreenText } from "@kiungo/core/parts";

let seq = 0;
const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({ id: `n${++seq}`, partId, label: label ?? partId, x, y, mode: "virtual" });

/** A board with peripherals auto-wired to it, as the lab's one-click add does. */
function build(boardId: string, ...peripherals: string[]) {
  const board = node(boardId, 0, 0, "Board");
  const nodes = [board];
  let wires: LabWire[] = [];
  const parts: Record<string, LabNode> = {};
  for (const p of peripherals) {
    const n = node(p, 600, nodes.length * 200, p);
    nodes.push(n);
    parts[p] = n;
    wires = [...wires, ...planAutoWire(n, nodes, wires).wires.map((w) => ({ id: `w${++seq}`, ...w }))];
  }
  const analysis: Analysis = analyze(nodes, wires);
  const at = (t: number, inputs?: Record<string, NodeInputs>, running = true) => frameAt(nodes, wires, analysis, t, running, inputs);
  return { board, parts, nodes, wires, analysis, at };
}

const set = (nodeId: string, values: NodeInputs): Record<string, NodeInputs> => ({ [nodeId]: { source: "set", ...values } });

/** Rising edges of a part's level in [t0, t1), sampled every 50 ms. */
function blinks(at: (t: number) => ReturnType<typeof frameAt>, id: string, t0: number, t1: number): number {
  let count = 0;
  let prev = 0;
  for (let t = t0; t < t1; t = Math.round((t + 0.05) * 1000) / 1000) {
    const level = at(t).nodes[id].level;
    if (level > 0 && prev === 0) count += 1;
    prev = level;
  }
  return count;
}

beforeEach(() => {
  freshLab();
  useLab.setState({ hydrated: true });
});

describe("Experiment 01: blinking LED", () => {
  it("blinks at the sketch's delay: period = 2 × delay, and the rate follows the setting", () => {
    const { board, parts, at } = build("arduino-uno", "led");
    const led = parts.led.id;
    // Default 500 ms delay → 1 s period: on for the first half.
    expect(at(0.1).nodes[led].level).toBe(1);
    expect(at(0.6).nodes[led].level).toBe(0);
    expect(at(1.1).nodes[led].level).toBe(1);
    expect(blinks((t) => at(t), led, 0, 10)).toBe(10);
    // 250 ms → twice as fast; 1000 ms → half as fast.
    expect(blinks((t) => at(t, { [board.id]: { delayMs: 250 } }), led, 0, 10)).toBe(20);
    expect(blinks((t) => at(t, { [board.id]: { delayMs: 1000 } }), led, 0, 10)).toBe(5);
    const slow = at(0.5, { [board.id]: { delayMs: 1000 } });
    expect(slow.nodes[led].level).toBe(1);
    expect(at(1.5, { [board.id]: { delayMs: 1000 } }).nodes[led].level).toBe(0);
    expect(slow.nodes[led].readings.find((r) => r.label === "Sketch")?.value).toBe("Blinking, 1000 ms");
    expect(slow.nodes[board.id].readings.find((r) => r.label === "Sketch")?.value).toBe("Blink, delay 1000 ms");
  });

  it("the board's own L LED follows the same delay, and everything is off when stopped", () => {
    const { board, at } = build("arduino-uno", "led");
    const l = `${board.id}:D13`;
    expect(at(0.2).pins[l]).toBe(1);
    expect(at(0.7).pins[l]).toBe(0);
    expect(at(0.7, { [board.id]: { delayMs: 1000 } }).pins[l]).toBe(1);
    const stopped = at(0.2, undefined, false);
    expect(stopped.pins[l]).toBe(0);
    expect(Object.values(stopped.nodes).every((n) => n.level === 0)).toBe(true);
  });

  it("clamps a delay outside the sketch's range instead of accepting it", () => {
    const control = findControl("arduino-uno", "delayMs")!;
    expect(coerceInput(control, 10)).toBe(50);
    expect(coerceInput(control, 99999)).toBe(5000);
    expect(coerceInput(control, "abc")).toBeNull();
  });
});

describe("Experiment 02: ultrasonic obstacle warning", () => {
  it("lets the obstacle be set, within the sensor's 2–400 cm range, and the reading follows it", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const us = parts["hc-sr04"].id;
    expect(at(1, set(us, { distanceCm: 123 })).nodes[us].readings[0]).toEqual({ label: "Distance", value: "123.0 cm" });
    const control = findControl("hc-sr04", "distanceCm")!;
    expect(coerceInput(control, 1000)).toBe(400);
    expect(coerceInput(control, -5)).toBe(2);
    expect(coerceInput(control, Number.NaN)).toBeNull();
  });

  it("the simulated sweep stays within 30–50 cm; it never grows without limit", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04");
    const us = parts["hc-sr04"].id;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 120; t += 0.5) {
      const d = Number.parseFloat(at(t).nodes[us].readings[0].value);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    expect(min).toBeGreaterThanOrEqual(30);
    expect(max).toBeLessThanOrEqual(50);
  });

  it("switches the LED and buzzer on below the warning distance, off above it, and off at exactly the threshold", () => {
    const { board, parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const us = parts["hc-sr04"].id;
    const led = parts.led.id;
    const buzzer = parts.buzzer.id;
    const warnCm = 20;
    const state = (distanceCm: number, t = 0.1) => {
      const f = at(t, { ...set(us, { distanceCm }), [board.id]: { warnCm } });
      return { distance: f.nodes[us].readings[0].value, led: f.nodes[led].level, buzzer: f.nodes[buzzer].badge, obstacle: f.nodes[us].readings[1].value };
    };
    expect(state(30)).toEqual({ distance: "30.0 cm", led: 0, buzzer: "Quiet", obstacle: "Clear" });
    expect(state(10)).toEqual({ distance: "10.0 cm", led: 1, buzzer: "BEEP", obstacle: "Closer than 20 cm" });
    // The comparison is strict: at the threshold the way is still clear.
    expect(state(20)).toEqual({ distance: "20.0 cm", led: 0, buzzer: "Quiet", obstacle: "Clear" });
    expect(state(19.9).led).toBe(1);
    // Crossing both ways is repeatable, at any time.
    expect(state(10, 7.3).led).toBe(1);
    expect(state(30, 7.3).led).toBe(0);
    expect(state(10, 12).led).toBe(1);
    // The buzzer beeps rather than holding a tone: on and off within a cycle.
    const beeping = { ...set(us, { distanceCm: 5 }), [board.id]: { warnCm } };
    expect(at(0.1, beeping).nodes[buzzer].level).toBe(1);
    expect(at(0.2, beeping).nodes[buzzer].level).toBe(0);
    // A changed threshold moves the boundary.
    expect(at(0.1, { ...set(us, { distanceCm: 30 }), [board.id]: { warnCm: 40 } }).nodes[led].level).toBe(1);
  });
});

describe("Experiment 03: DHT11 with an LCD 16×2", () => {
  it("shows the temperature and humidity the sensor reads, on separate lines, within 16 characters", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const dht = parts.dht11.id;
    const lcd = parts["lcd-16x2"].id;
    const cases: Array<[number, number, string[]]> = [
      [23.8, 60, ["Temp: 23.8 °C", "Hum: 60 %"]],
      [24.9, 45, ["Temp: 24.9 °C", "Hum: 45 %"]],
      [25, 71, ["Temp: 25.0 °C", "Hum: 71 %"]],
    ];
    for (const [temperatureC, humidity, lines] of cases) {
      const f = at(2, set(dht, { temperatureC, humidity }));
      // 1. the sensor, 2. what the display-writing path received, 3. the glass.
      expect(f.nodes[dht].readings.map((r) => r.value)).toEqual([`${temperatureC.toFixed(1)} °C`, `${humidity} %`]);
      expect(f.nodes[lcd].readings[0]).toEqual({ label: "Showing", value: lines.join(" · ") });
      expect(f.nodes[lcd].text).toEqual(lines);
      expect(f.nodes[lcd].text!.every((l) => l.length <= 16)).toBe(true);
    }
  });

  it("updates on the next frame when the value changes mid-run, and never shows the library's sample text", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const dht = parts.dht11.id;
    const lcd = parts["lcd-16x2"].id;
    expect(at(5, set(dht, { temperatureC: 23.8, humidity: 60 })).nodes[lcd].text?.[0]).toBe("Temp: 23.8 °C");
    expect(at(5.1, set(dht, { temperatureC: 24.9, humidity: 60 })).nodes[lcd].text?.[0]).toBe("Temp: 24.9 °C");
    const model = getPart("lcd-16x2")!;
    expect(hasScreen(model)).toBe(true);
    const written = withScreenText(model, ["Temp: 24.9 °C", "Hum: 60 %"]);
    const lines = written.solids.filter((s) => s.kind === "text" && s.id?.startsWith("screen:")).map((s) => (s as { text: string }).text);
    expect(lines).toEqual(["Temp: 24.9 °C", "Hum: 60 %"]);
    const blank = withScreenText(model, []);
    expect(blank.solids.filter((s) => s.kind === "text" && s.id?.startsWith("screen")).every((s) => (s as { text: string }).text === "")).toBe(true);
    expect(withScreenText(model, ["a", "b"])).toBe(written.solids === withScreenText(model, ["Temp: 24.9 °C", "Hum: 60 %"]).solids ? withScreenText(model, ["a", "b"]) : withScreenText(model, ["a", "b"]));
  });

  it("follows the simulated sweep when nothing is set, and is blank when the sketch isn't running or the sensor is off", () => {
    const { parts, at, nodes, wires } = build("arduino-uno", "dht11", "lcd-16x2");
    const dht = parts.dht11.id;
    const lcd = parts["lcd-16x2"].id;
    const a = at(3);
    const b = at(9);
    expect(a.nodes[lcd].text?.[0]).toBe(`Temp: ${a.nodes[dht].readings[0].value}`);
    expect(b.nodes[lcd].text?.[0]).not.toBe(a.nodes[lcd].text?.[0]);
    expect(at(3, undefined, false).nodes[lcd].text).toEqual([]);
    // Unwire the sensor: the LCD shows it has nothing to show, not a made-up temperature.
    const without = wires.filter((w) => w.from.node !== dht && w.to.node !== dht);
    const f = frameAt(nodes, without, analyze(nodes, without), 3, true);
    expect(f.nodes[lcd].text).toEqual(["Hello, Kiungo!", "Up 3 s"]);
    expect(f.nodes[lcd].readings[1]).toEqual({ label: "Source", value: "No sensor on this board" });
  });

  it("formats other displays to their own width and depth", () => {
    const dht = node("dht22", 0, 0, "DHT22");
    const sample = sampleSensor(dht, 0, set(dht.id, { temperatureC: -3.5, humidity: 100 }), boardSettings(null, undefined));
    expect(displayLines("oled-ssd1306", [sample], 0)).toEqual(["Temp: -3.5 °C", "Hum: 100 %"]);
    expect(displayLines("lcd-16x2", [], 12)).toEqual(["Hello, Kiungo!", "Up 12 s"]);
  });
});

describe("Experiment 04: motion-activated gate", () => {
  it("holds the motion state you set, and opens or rests the servo and LED by the sketch's gate policy", () => {
    const { board, parts, at } = build("arduino-uno", "pir", "servo", "led");
    const pir = parts.pir.id;
    const servo = parts.servo.id;
    const led = parts.led.id;
    const state = (motion: boolean, t: number, settings: NodeInputs = {}) => {
      const f = at(t, { ...set(pir, { motion }), [board.id]: settings });
      return { pir: f.nodes[pir].readings[0].value, angle: f.nodes[servo].angle, led: f.nodes[led].level, command: f.nodes[servo].readings[1]?.value };
    };
    // 1. no motion → motion; 2. motion → no motion; 3. none → none; 4. detected → stays detected.
    expect(state(false, 1)).toEqual({ pir: "None", angle: 0, led: 0, command: "Rest (0°): no motion" });
    expect(state(true, 2)).toEqual({ pir: "Detected", angle: 90, led: 1, command: "Open (90°): motion seen" });
    expect(state(false, 3).angle).toBe(0);
    expect(state(false, 3.5).angle).toBe(0);
    for (const t of [4, 5.5, 9, 30]) expect(state(true, t).angle).toBe(90);
    // Configured angles, within the servo's 0–180° travel.
    expect(state(true, 1, { gateOpen: 120, gateRest: 10 }).angle).toBe(120);
    expect(state(false, 1, { gateOpen: 120, gateRest: 10 }).angle).toBe(10);
    expect(coerceInput(findControl("arduino-uno", "gateOpen")!, 500)).toBe(180);
  });

  it("5. stop → restart keeps the gate where the sketch last put it, and never sweeps by itself", () => {
    const { parts, at } = build("arduino-uno", "pir", "servo", "led");
    const pir = parts.pir.id;
    const servo = parts.servo.id;
    const inputs = set(pir, { motion: true });
    expect(at(4, inputs).nodes[servo].angle).toBe(90);
    expect(at(4, inputs, false).nodes[servo].angle).toBe(90);
    expect(at(4.1, inputs).nodes[servo].angle).toBe(90);
    // The servo has no command of its own while a PIR drives it.
    const { nodes, analysis } = build("arduino-uno", "pir", "servo");
    const servoNode = nodes.find((n) => n.partId === "servo")!;
    expect(controlsFor(servoNode, nodes, analysis)).toMatchObject({ title: "Command", controls: [] });
    expect(controlsFor(servoNode, nodes, analysis).note).toMatch(/Driven by the sketch from the PIR sensor/);
  });

  it("without a PIR, a servo holds the angle you set, or sweeps only in the simulated mode", () => {
    const { parts, at } = build("arduino-uno", "servo");
    const servo = parts.servo.id;
    expect(at(1, set(servo, { angle: 45 })).nodes[servo].angle).toBe(45);
    expect(at(7, set(servo, { angle: 45 })).nodes[servo].angle).toBe(45);
    expect(at(1).nodes[servo].readings[1].value).toBe("Sweep (simulated)");
  });

  it("the simulated PIR, when nothing is set, follows its documented 8 s cycle", () => {
    const { parts, at } = build("arduino-uno", "pir");
    const pir = parts.pir.id;
    expect(at(1).nodes[pir].readings[0].value).toBe("Detected");
    expect(at(5).nodes[pir].readings[0].value).toBe("None");
    expect(at(9).nodes[pir].readings[0].value).toBe("Detected");
  });
});

describe("Experiment 05: DC motor and stepper motor", () => {
  it("DC motor: speed and direction follow the command; zero speed and Stop bring it to rest", () => {
    const { parts, at } = build("arduino-uno", "dc-motor");
    const m = parts["dc-motor"].id;
    const pinsWired = Object.keys(at(0).pins).filter((k) => k.startsWith(m));
    expect(pinsWired).toEqual(expect.arrayContaining([`${m}:EN`, `${m}:IN1`, `${m}:IN2`]));
    const state = (speed: number, direction: "forward" | "reverse", t = 1) => {
      const f = at(t, set(m, { speed, direction }));
      return { rpm: f.nodes[m].readings[0].value, dir: f.nodes[m].readings[1].value, in1: f.pins[`${m}:IN1`], in2: f.pins[`${m}:IN2`], en: f.pins[`${m}:EN`] };
    };
    expect(state(0, "forward")).toEqual({ rpm: "0 rpm", dir: "Stopped", in1: 1, in2: 0, en: 0 });
    expect(state(50, "forward")).toEqual({ rpm: `${Math.round(0.5 * DC_MOTOR_MAX_RPM)} rpm`, dir: "Forward", in1: 1, in2: 0, en: 0.5 });
    expect(state(100, "forward").rpm).toBe(`${DC_MOTOR_MAX_RPM} rpm`);
    expect(state(50, "reverse")).toEqual({ rpm: "70 rpm", dir: "Reverse", in1: 0, in2: 1, en: 0.5 });
    // Direction and speed hold over time; nothing alternates by itself.
    for (const t of [2, 9, 40]) expect(state(50, "reverse", t).dir).toBe("Reverse");
    expect(coerceInput(findControl("dc-motor", "speed")!, 150)).toBe(100);
  });

  it("DC motor: without an EN wire it can only be full on or stopped, and says so", () => {
    const { board, parts, nodes, wires } = build("arduino-uno", "dc-motor");
    const m = parts["dc-motor"].id;
    const noEn = wires.filter((w) => !(w.from.node === m && w.from.pin === "EN") && !(w.to.node === m && w.to.pin === "EN"));
    const analysis = analyze(nodes, noEn);
    const f = frameAt(nodes, noEn, analysis, 1, true, set(m, { speed: 40, direction: "forward" }));
    expect(f.nodes[m].readings[0].value).toBe(`${DC_MOTOR_MAX_RPM} rpm`);
    expect(f.nodes[m].readings.find((r) => r.label === "Note")?.value).toMatch(/EN isn't wired/);
    expect(board.id).toBeTruthy();
  });

  it("stepper: a commanded move runs at the set speed, stops at the target, reverses, and keeps a consistent step count", () => {
    const { parts, at } = build("arduino-uno", "stepper-motor");
    const s = parts["stepper-motor"].id;
    const cmd = (from: number, target: number, at0: number, sps = 256): Record<string, NodeInputs> => set(s, { cmdFrom: from, cmdTarget: target, cmdAt: at0, stepsPerSecond: sps });
    // 512 steps clockwise from rest at t=0 → a quarter turn, done after 2 s, then holding.
    expect(stepperStepsAt(cmd(0, 512, 0), s, 1)).toBe(256);
    const mid = at(1, cmd(0, 512, 0));
    expect(mid.nodes[s].readings.map((r) => r.value)).toEqual(["45°", "256", "256 steps to go clockwise", "+512 steps", "256 of 512"]);
    expect(at(2, cmd(0, 512, 0)).nodes[s].readings.map((r) => r.value)).toEqual(["90°", "512", "Holding", "+512 steps", "512 of 512"]);
    expect(at(10, cmd(0, 512, 0)).nodes[s].readings[1].value).toBe("512");
    expect(at(10, cmd(0, 512, 0)).nodes[s].on).toBe(false);
    // Reverse 512 from there at t=10 → back to 0 by t=12.
    expect(at(11, cmd(512, 0, 10)).nodes[s].readings.map((r) => r.value)).toEqual(["45°", "256", "256 steps to go anticlockwise", "−512 steps", "256 of 512"]);
    expect(at(12, cmd(512, 0, 10)).nodes[s].readings.slice(0, 2).map((r) => r.value)).toEqual(["0°", "0"]);
    // Two full turns: the angle wraps, the count accumulates.
    const two = at(100, cmd(0, 2 * STEPPER_STEPS_PER_TURN, 0));
    expect(two.nodes[s].readings.slice(0, 2).map((r) => r.value)).toEqual(["0°", "4096"]);
    // Faster speed, same distance.
    expect(stepperStepsAt(cmd(0, 512, 0, 512), s, 1)).toBe(512);
    // One coil at a time while moving, none while holding.
    const coils = (f: ReturnType<typeof at>) => ["IN1", "IN2", "IN3", "IN4"].map((p) => f.pins[`${s}:${p}`]);
    expect(coils(mid).filter((v) => v === 1)).toHaveLength(1);
    expect(coils(at(10, cmd(0, 512, 0))).every((v) => v === 0)).toBe(true);
  });

  it("stepper: Go, Stop and Zero through the store, at the lab's clock", () => {
    const session = useLab.getState().createSession({ name: "Motors" });
    const uno = useLab.getState().addNode("arduino-uno")!;
    const stepper = useLab.getState().addNode("stepper-motor")!;
    expect(uno).toBeTruthy();
    useLab.getState().commandStepper(stepper.id, 1024, 0);
    let inputs = useLab.getState().sessions.find((s) => s.id === session.id)!.inputs!;
    expect(inputs[stepper.id]).toMatchObject({ source: "set", cmdFrom: 0, cmdTarget: 1024, cmdAt: 0 });
    // Stop at t=2 (512 steps in): hold there.
    useLab.getState().commandStepper(stepper.id, 0, 2);
    inputs = useLab.getState().sessions.find((s) => s.id === session.id)!.inputs!;
    expect(inputs[stepper.id]).toMatchObject({ cmdFrom: 512, cmdTarget: 512, cmdAt: 2 });
    expect(stepperStepsAt(inputs, stepper.id, 50)).toBe(512);
    useLab.getState().zeroStepper(stepper.id, 3);
    inputs = useLab.getState().sessions.find((s) => s.id === session.id)!.inputs!;
    expect(stepperStepsAt(inputs, stepper.id, 3)).toBe(0);
    expect(useLab.getState().sessions[0].log.at(-1)?.text).not.toMatch(/move 0 steps/);
  });

  it("in the simulated mode the stepper turns continuously at a documented rate", () => {
    const { parts, at } = build("arduino-uno", "stepper-motor");
    const s = parts["stepper-motor"].id;
    // 128 steps/s of 2048 per turn = 22.5°/s.
    expect(at(2).nodes[s].readings.slice(0, 2).map((r) => r.value)).toEqual(["45°", "256"]);
    expect(at(16).nodes[s].readings[0].value).toBe("0°");
  });
});

describe("Inputs in the session", () => {
  it("setting a value takes the part over from the sweep; Defaults gives it back; values are clamped", () => {
    const session = useLab.getState().createSession({ name: "Inputs" });
    useLab.getState().addNode("arduino-uno");
    const us = useLab.getState().addNode("hc-sr04")!;
    const current = () => useLab.getState().sessions.find((s) => s.id === session.id)!;
    useLab.getState().setInput(us.id, "distanceCm", 900);
    expect(current().inputs?.[us.id]).toEqual({ source: "set", distanceCm: 400 });
    useLab.getState().setInput(us.id, "distanceCm", Number.NaN);
    expect(current().inputs?.[us.id]?.distanceCm).toBe(400);
    useLab.getState().setInput(us.id, "source", "auto");
    expect(current().inputs?.[us.id]?.source).toBe("auto");
    useLab.getState().clearInputs(us.id);
    expect(current().inputs?.[us.id]).toBeUndefined();
  });

  it("follows the part when it is duplicated or removed, and old saved sessions get an empty set", () => {
    const session = useLab.getState().createSession({ name: "Copy" });
    useLab.getState().addNode("arduino-uno");
    const pir = useLab.getState().addNode("pir")!;
    useLab.getState().setInput(pir.id, "motion", true);
    const copy = useLab.getState().duplicateNodes([pir.id])[0];
    const current = () => useLab.getState().sessions.find((s) => s.id === session.id)!;
    expect(current().inputs?.[copy.id]).toEqual({ source: "set", motion: true });
    useLab.getState().removeNodes([pir.id, copy.id]);
    expect(current().inputs).toEqual({});
    window.localStorage.setItem(labKeyFor("acct-test"), JSON.stringify({ version: 1, sessions: [{ id: "old", name: "Old", nodes: [], wires: [], log: [] }], activeId: "old" }));
    expect(readLabData().sessions[0].inputs).toEqual({});
  });

  it("shows a board only the sketch settings that apply to what is wired to it", () => {
    const plain = build("arduino-uno", "led");
    expect(controlsFor(plain.board, plain.nodes, plain.analysis).controls.map((c) => c.key)).toEqual(["delayMs"]);
    const radar = build("arduino-uno", "hc-sr04", "led");
    expect(controlsFor(radar.board, radar.nodes, radar.analysis).controls.map((c) => c.key)).toEqual(["delayMs", "warnCm"]);
    const gate = build("arduino-uno", "pir", "servo");
    expect(controlsFor(gate.board, gate.nodes, gate.analysis).controls.map((c) => c.key)).toEqual(["delayMs", "gateOpen", "gateRest"]);
    expect(controlsFor(radar.parts["hc-sr04"], radar.nodes, radar.analysis).title).toBe("Surroundings");
    expect(controlsFor(radar.parts.led, radar.nodes, radar.analysis).note).toMatch(/Driven by the sketch from the ultrasonic sensor/);
  });
});
