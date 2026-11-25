/**
 * QA cycle 2: acceptance tests for the five Engineering Lab experiments, as
 * the brief lists them. Each frame comes from frameAt(), a pure function of
 * the build, the inputs and the clock, so every case is deterministic.
 *
 * Experiment 01 here is the LDR-controlled LED (the board's "Dark below"
 * setting). Blink is covered in LabExperiments.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { analyze, ledCurrentMa } from "@kiungo/core/lab/circuit";
import { planAutoWire } from "@kiungo/core/lab/autowire";
import { coerceInput, findControl } from "@kiungo/core/lab/controls";
import { DC_MOTOR_MAX_RPM, STEPPER_STEPS_PER_TURN, frameAt, stepperStepsAt } from "@kiungo/core/lab/simulate";
import { boardSettings, planBoard, sampleSensor } from "@kiungo/core/lab/sketch";
import { useLab } from "@kiungo/lab/store";
import type { LabNode, LabWire, NodeInputs } from "@kiungo/core/lab/types";
import { getPart, withScreenText } from "@kiungo/core/parts";

let seq = 0;
const node = (partId: string, x = 0, y = 0): LabNode => ({ id: `q${++seq}`, partId, label: partId === "dht11" ? "DHT11" : partId, x, y, mode: "virtual" });

function build(boardId: string, ...peripherals: string[]) {
  const board = node(boardId);
  const nodes = [board];
  let wires: LabWire[] = [];
  const parts: Record<string, LabNode> = {};
  for (const p of peripherals) {
    const n = node(p, 600, nodes.length * 200);
    nodes.push(n);
    parts[p] = n;
    wires = [...wires, ...planAutoWire(n, nodes, wires).wires.map((w) => ({ id: `w${++seq}`, ...w }))];
  }
  const analysis = analyze(nodes, wires);
  const at = (t: number, inputs?: Record<string, NodeInputs>, running = true) => frameAt(nodes, wires, analysis, t, running, inputs);
  return { board, parts, nodes, wires, analysis, at };
}

const set = (nodeId: string, values: NodeInputs): Record<string, NodeInputs> => ({ [nodeId]: { source: "set", ...values } });
const merge = (...all: Array<Record<string, NodeInputs>>) => Object.assign({}, ...all) as Record<string, NodeInputs>;
const reading = (f: ReturnType<typeof frameAt>, id: string, label: string) => f.nodes[id].readings.find((r) => r.label === label)?.value;
/** What the LCD model's glass shows: the screen:N text solids. */
const glass = (lines: string[]) =>
  withScreenText(getPart("lcd-16x2")!, lines)
    .solids.filter((s) => s.kind === "text" && /^screen:/.test(s.id ?? ""))
    .map((s) => (s as { text: string }).text);

beforeEach(() => {
  window.localStorage.clear();
  useLab.setState({ hydrated: true, sessions: [], activeId: null, past: [], future: [] });
});

describe("P0 · Experiment 03: DHT11 → sketch → LCD 16×2", () => {
  const temps = [0, 10, 24.5, 35, 50];
  const hums = [30, 80];

  for (const temperatureC of temps) {
    for (const humidity of hums) {
      it(`${temperatureC} °C, ${humidity} %: input → sensor → sketch → LCD → glass`, () => {
        const { board, parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
        const dht = parts.dht11;
        const lcd = parts["lcd-16x2"];
        const inputs = set(dht.id, { temperatureC, humidity });
        // 1. The configured input (the store's coercion keeps it as given: it's in range and on the step).
        expect(coerceInput(findControl("dht11", "temperatureC")!, temperatureC)).toBe(temperatureC);
        expect(coerceInput(findControl("dht11", "humidity")!, humidity)).toBe(humidity);
        // 2. The sensor's reading.
        const sample = sampleSensor(dht, 3, inputs, boardSettings(board.id, inputs));
        expect(sample.values).toEqual({ temperatureC, humidity });
        expect(sample.held).toBe(true);
        // 3. What the board's sketch reads.
        const plan = planBoard(board.id, [sample], inputs);
        expect(plan.samples[0].values.temperatureC).toBe(temperatureC);
        // 4. What the sketch writes to the display, and 5. what the glass shows.
        const f = at(3, inputs);
        const expected = [`Temp: ${temperatureC.toFixed(1)} °C`, `Hum: ${humidity} %`];
        expect(reading(f, dht.id, "Temperature")).toBe(`${temperatureC.toFixed(1)} °C`);
        expect(f.nodes[lcd.id].text).toEqual(expected);
        expect(expected.every((l) => l.length <= 16)).toBe(true);
        expect(glass(f.nodes[lcd.id].text!)).toEqual(expected);
        expect(reading(f, lcd.id, "Source")).toBe("DHT11 (set)");
      });
    }
  }

  it("follows a change made mid-run on the next frame, without a reload", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const { dht11: dht, "lcd-16x2": lcd } = parts;
    expect(at(5, set(dht.id, { temperatureC: 10, humidity: 30 })).nodes[lcd.id].text).toEqual(["Temp: 10.0 °C", "Hum: 30 %"]);
    expect(at(5.1, set(dht.id, { temperatureC: 50, humidity: 80 })).nodes[lcd.id].text).toEqual(["Temp: 50.0 °C", "Hum: 80 %"]);
    expect(at(5.2, set(dht.id, { temperatureC: 0, humidity: 80 })).nodes[lcd.id].text).toEqual(["Temp: 0.0 °C", "Hum: 80 %"]);
  });

  it("isn't overwritten by other parts' updates", () => {
    const { board, parts, at } = build("arduino-uno", "dht11", "lcd-16x2", "led", "servo");
    const dht = set(parts.dht11.id, { temperatureC: 35, humidity: 30 });
    const before = at(2, dht).nodes[parts["lcd-16x2"].id].text;
    const after = at(2, merge(dht, set(parts.servo.id, { angle: 10 }), { [board.id]: { delayMs: 100 } })).nodes[parts["lcd-16x2"].id].text;
    expect(after).toEqual(before);
    expect(after).toEqual(["Temp: 35.0 °C", "Hum: 30 %"]);
  });

  it("rounds to the shown precision: one decimal for temperature, whole percent for humidity", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const f = at(1, set(parts.dht11.id, { temperatureC: 24.46, humidity: 55.6 }));
    expect(f.nodes[parts["lcd-16x2"].id].text).toEqual(["Temp: 24.5 °C", "Hum: 56 %"]);
  });

  it("says when the reading is simulated, and never shows sample text or a made-up value", () => {
    const { parts, at, nodes, wires } = build("arduino-uno", "dht11", "lcd-16x2");
    const lcd = parts["lcd-16x2"].id;
    const sweep = at(4);
    expect(reading(sweep, lcd, "Source")).toBe("DHT11 (simulated)");
    expect(sweep.nodes[lcd].text?.join("|")).not.toMatch(/24\.5 C|Hello/);
    expect(at(4, undefined, false).nodes[lcd].text).toEqual([]);
    expect(glass([])).toEqual(["", ""]);
    // The DHT11 loses its ground: the sketch gets no reading, and the LCD says so.
    const gnd = wires.filter((w) => w.from.node === parts.dht11.id || w.to.node === parts.dht11.id).find((w) => [w.from.pin, w.to.pin].includes("GND"))!;
    const left = wires.filter((w) => w !== gnd);
    const broken = frameAt(nodes, left, analyze(nodes, left), 4, true, set(parts.dht11.id, { temperatureC: 50, humidity: 80 }));
    expect(broken.nodes[lcd].text).toEqual(["DHT11: no data", "Check its wiring"]);
    expect(reading(broken, lcd, "Source")).toBe("DHT11 (no data)");
  });
});

describe("P1 · Experiment 01: LDR-controlled LED and the resistor tip", () => {
  it("the LED is on while light < Dark below (30 % by default): 29 on, 30 and 31 off; 0 and 100 at the ends", () => {
    const { parts, at } = build("arduino-uno", "ldr", "led");
    const led = (light: number) => at(2, set(parts.ldr.id, { light })).nodes[parts.led.id].on;
    expect([0, 29, 30, 31, 100].map(led)).toEqual([true, true, false, false, false]);
    // Out of range is clamped to the slider's ends.
    expect(coerceInput(findControl("ldr", "light")!, -5)).toBe(0);
    expect(coerceInput(findControl("ldr", "light")!, 140)).toBe(100);
  });

  it("the threshold is the board's Dark below setting", () => {
    const { board, parts, at } = build("arduino-uno", "ldr", "led");
    const inputs = merge(set(parts.ldr.id, { light: 45 }), { [board.id]: { darkPct: 50 } });
    expect(at(2, inputs).nodes[parts.led.id].on).toBe(true);
  });

  it("holds its state while the light doesn't change, and switches back and forth repeatably", () => {
    const { parts, at } = build("arduino-uno", "ldr", "led");
    for (const [light, on] of [[20, true], [40, false], [20, true], [40, false]] as const) {
      for (let t = 1; t < 6; t += 0.5) expect(at(t, set(parts.ldr.id, { light })).nodes[parts.led.id].on).toBe(on);
    }
  });

  it("with no resistor wired, the tip and the reading both assume 220 Ω", () => {
    const { parts, analysis, at } = build("arduino-uno", "ldr", "led");
    const tip = analysis.nodes[parts.led.id].faults.find((f) => f.id.startsWith("resistor"))!;
    expect(tip.severity).toBe("tip");
    expect(tip.title).toBe("Assumed: 220 Ω resistor in series");
    expect(tip.detail).toMatch(/No resistor is wired.*220 Ω.*5 V pin.*13\.6 mA.*Add a Resistor part/);
    expect(reading(at(2, set(parts.ldr.id, { light: 10 })), parts.led.id, "Current (modeled)")).toBe("13.6 mA via 220 Ω (assumed)");
    expect(reading(at(2, set(parts.ldr.id, { light: 90 })), parts.led.id, "Current (modeled)")).toBe("0 mA");
    // On a 3.3 V board the same resistor gives less.
    const esp = build("esp32", "led");
    expect(esp.analysis.nodes[esp.parts.led.id].faults.find((f) => f.id.startsWith("resistor"))!.detail).toMatch(/3\.3 V pin.*5\.9 mA/);
    expect(ledCurrentMa(5)).toBeCloseTo(13.64, 2);
  });
});

describe("The resistor part", () => {
  const led = (ohms?: number, side: "anode" | "cathode" = "anode") => {
    const uno = { id: "uno", partId: "arduino-uno", label: "Uno", x: 0, y: 0, mode: "virtual" as const };
    const r = { id: "r1", partId: "resistor", label: "Resistor", x: 0, y: 0, mode: "virtual" as const };
    const l = { id: "led", partId: "led", label: "LED", x: 0, y: 0, mode: "virtual" as const };
    const w = (a: string, ap: string, b: string, bp: string, id: string) => ({ id, from: { node: a, pin: ap }, to: { node: b, pin: bp } });
    const wires =
      side === "anode"
        ? [w("uno", "D13", "r1", "1", "w1"), w("r1", "2", "led", "A", "w2"), w("led", "C", "uno", "GND1", "w3")]
        : [w("uno", "D13", "led", "A", "w1"), w("led", "C", "r1", "1", "w2"), w("r1", "2", "uno", "GND1", "w3")];
    const inputs: Record<string, NodeInputs> = ohms ? { r1: { ohms: String(ohms) } } : {};
    const nodes = [uno, r, l];
    return { nodes, wires, inputs, analysis: analyze(nodes, wires, inputs) };
  };

  it("drives an LED through it, on either side, and uses its real value", () => {
    for (const side of ["anode", "cathode"] as const) {
      const { analysis } = led(220, side);
      const report = analysis.nodes.led;
      expect(report.status, side).toBe("ready");
      expect(report.seriesOhms, side).toBe(220);
      expect(report.faults.map((f) => f.id), side).not.toContain(expect.stringMatching(/^resistor/));
      expect(report.links.some((l) => l.boardPin === "D13"), side).toBe(true);
    }
    const { nodes, wires, inputs, analysis } = led(1000);
    const frame = frameAt(nodes, wires, analysis, 0.2, true, inputs);
    expect(frame.nodes.led.readings.find((r) => r.label === "Current")?.value).toBe("3.0 mA via 1 kΩ");
    expect(frame.nodes.r1.readings[0]).toEqual({ label: "Value", value: "1 kΩ" });
  });

  it("warns when the resistor is too small for the LED", () => {
    const f = led(100).analysis.nodes.led.faults.find((x) => x.id.startsWith("too-much-current"))!;
    expect(f.severity).toBe("warning");
    expect(f.title).toBe("30 mA: more than the LED takes");
    expect(f.detail).toMatch(/Use at least 150 Ω/);
    expect(led(220).analysis.nodes.led.faults.some((x) => x.id.startsWith("too-much-current"))).toBe(false);
  });

  it("goes in series with an LED wired straight to a pin when auto-wired", () => {
    const uno = { id: "uno", partId: "arduino-uno", label: "Uno", x: 0, y: 0, mode: "virtual" as const };
    const l = { id: "led", partId: "led", label: "LED", x: 0, y: 0, mode: "virtual" as const };
    const r = { id: "r1", partId: "resistor", label: "Resistor", x: 0, y: 0, mode: "virtual" as const };
    const wires = [
      { id: "wa", from: { node: "uno", pin: "D13" }, to: { node: "led", pin: "A" } },
      { id: "wc", from: { node: "uno", pin: "GND1" }, to: { node: "led", pin: "C" } },
    ];
    const plan = planAutoWire(r, [uno, l, r], wires);
    expect(plan.remove).toEqual(["wa"]);
    expect(plan.wires).toEqual([
      { from: { node: "uno", pin: "D13" }, to: { node: "r1", pin: "1" } },
      { from: { node: "led", pin: "A" }, to: { node: "r1", pin: "2" } },
    ]);
    const after = [...wires.filter((w) => w.id !== "wa"), ...plan.wires.map((w, i) => ({ id: `n${i}`, ...w }))];
    expect(analyze([uno, l, r], after).nodes.led.seriesOhms).toBe(220);
  });
});

describe("P1 · Experiment 02: ultrasonic warning", () => {
  it("19 cm warns; 20 cm (equal) and 21 cm don't: the rule is distance < Warning distance", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const state = (distanceCm: number) => {
      const f = at(3, set(parts["hc-sr04"].id, { distanceCm }));
      return { shown: reading(f, parts["hc-sr04"].id, "Distance"), led: f.nodes[parts.led.id].on, beeping: !!f.nodes[parts.buzzer.id].tone };
    };
    expect(state(19)).toEqual({ shown: "19.0 cm", led: true, beeping: true });
    expect(state(20)).toEqual({ shown: "20.0 cm", led: false, beeping: false });
    expect(state(21)).toEqual({ shown: "21.0 cm", led: false, beeping: false });
  });

  it("handles the range ends and rejects what isn't a number", () => {
    const c = findControl("hc-sr04", "distanceCm")!;
    expect([coerceInput(c, 2), coerceInput(c, 400), coerceInput(c, 0), coerceInput(c, 999)]).toEqual([2, 400, 2, 400]);
    expect(coerceInput(c, Number.NaN)).toBeNull();
    expect(coerceInput(c, "abc")).toBeNull();
    const { parts, at } = build("arduino-uno", "hc-sr04", "led");
    expect(at(1, set(parts["hc-sr04"].id, { distanceCm: 2 })).nodes[parts.led.id].on).toBe(true);
    expect(at(1, set(parts["hc-sr04"].id, { distanceCm: 400 })).nodes[parts.led.id].on).toBe(false);
  });

  it("the buzzer is an active buzzer beeping 150 ms on / 150 ms off while the warning holds; the LED stays steadily on", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const near = set(parts["hc-sr04"].id, { distanceCm: 10 });
    expect(at(1, near).nodes[parts.buzzer.id].tone).toEqual({ hz: 2300, pattern: { period: 0.3, duty: 0.5, phase: 0 } });
    for (let t = 1; t < 4; t += 0.05) expect(at(t, near).nodes[parts.led.id].on).toBe(true);
  });

  it("is steady while the input doesn't change, repeatable across the threshold, and clean after Stop → Run", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const led = (t: number, distanceCm: number, running = true) => at(t, set(parts["hc-sr04"].id, { distanceCm }), running).nodes[parts.led.id].on;
    for (const [d, on] of [[30, false], [10, true], [30, false], [10, true]] as const) for (let t = 0; t < 3; t += 0.25) expect(led(t, d)).toBe(on);
    expect(led(3, 10, false)).toBe(false);
    expect(at(3, set(parts["hc-sr04"].id, { distanceCm: 10 }), false).nodes[parts.buzzer.id].tone).toBeNull();
    expect(led(3.1, 10)).toBe(true);
  });
});

describe("P1 · Experiment 04: PIR gate", () => {
  it("none → detected → detected → none, twice, then Stop and Run: LED and servo follow, and never drift", () => {
    const { parts, at } = build("arduino-uno", "pir", "servo", "led");
    const step = (t: number, motion: boolean, running = true) => {
      const f = at(t, set(parts.pir.id, { motion }), running);
      return { motion: reading(f, parts.pir.id, "Motion") ?? "—", led: f.nodes[parts.led.id].on, angle: f.nodes[parts.servo.id].angle };
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
      const m = parts["dc-motor"].id;
      const f = at(2, set(m, { speed, direction }));
      expect(reading(f, m, "Speed")).toBe(`${rpm} rpm`);
      expect(reading(f, m, "Direction")).toBe(dir);
      expect(f.nodes[m].level).toBeCloseTo(speed / 100, 6);
      expect(f.pins[`${m}:EN`]).toBeCloseTo(speed / 100, 6);
      expect(rpm).toBe(Math.round((speed / 100) * DC_MOTOR_MAX_RPM));
    });
  }

  it("DC-07: 50 % forward then reverse switches IN1/IN2 and turns the shaft the other way", () => {
    const { parts, at } = build("arduino-uno", "dc-motor");
    const m = parts["dc-motor"].id;
    const fwd = (t: number) => at(t, set(m, { speed: 50, direction: "forward" }));
    const rev = (t: number) => at(t, set(m, { speed: 50, direction: "reverse" }));
    expect([fwd(1).pins[`${m}:IN1`], fwd(1).pins[`${m}:IN2`]]).toEqual([1, 0]);
    expect([rev(1).pins[`${m}:IN1`], rev(1).pins[`${m}:IN2`]]).toEqual([0, 1]);
    const delta = (f: (t: number) => ReturnType<typeof frameAt>) => ((((f(1.01).nodes[m].angle! - f(1).nodes[m].angle!) % 360) + 540) % 360) - 180;
    expect(delta(fwd)).toBeGreaterThan(0);
    expect(delta(rev)).toBeLessThan(0);
  });

  it("DC-08: speed 0, or Stop, halts it and it stays halted; the same setting gives the same speed on every run", () => {
    const { parts, at } = build("arduino-uno", "dc-motor");
    const m = parts["dc-motor"].id;
    for (let t = 0; t < 10; t += 1) expect(reading(at(t, set(m, { speed: 0 })), m, "Speed")).toBe("0 rpm");
    for (let t = 0; t < 10; t += 1) expect(at(t, set(m, { speed: 80 }), false).nodes[m].on).toBe(false);
    const speeds = [1, 5, 50, 500].map((t) => reading(at(t, set(m, { speed: 60 })), m, "Speed"));
    expect(new Set(speeds)).toEqual(new Set(["84 rpm"]));
  });
});

describe("P1 · Experiment 05: stepper", () => {
  const start = () => {
    const session = useLab.getState().createSession({ name: "Stepper" });
    useLab.getState().addNode("arduino-uno");
    const stepper = useLab.getState().addNode("stepper-motor")!;
    const inputs = () => useLab.getState().sessions.find((s) => s.id === session.id)!.inputs!;
    return { id: stepper.id, inputs, store: useLab.getState() };
  };

  it("100 steps at 100 steps/s, then 200: executed matches commanded, separately from position", () => {
    const { id, inputs, store } = start();
    store.setInput(id, "stepsPerSecond", 100, 0);
    store.commandStepper(id, 100, 0);
    expect(stepperStepsAt(inputs(), id, 0.5)).toBe(50);
    expect(stepperStepsAt(inputs(), id, 1)).toBe(100);
    expect(stepperStepsAt(inputs(), id, 9)).toBe(100);
    store.commandStepper(id, 200, 10);
    expect(stepperStepsAt(inputs(), id, 11)).toBe(200);
    expect(stepperStepsAt(inputs(), id, 12)).toBe(300);
    expect(inputs()[id]).toMatchObject({ cmdStart: 100, cmdTarget: 300 });
  });

  it("reverse, Zero, and Stop partway: Stop holds and doesn't finish the move; a new move starts from there", () => {
    const { id, inputs, store } = start();
    store.setInput(id, "stepsPerSecond", 100, 0);
    store.commandStepper(id, -50, 0);
    expect(stepperStepsAt(inputs(), id, 1)).toBe(-50);
    store.zeroStepper(id, 1);
    expect(stepperStepsAt(inputs(), id, 1)).toBe(0);
    store.commandStepper(id, 1000, 2);
    store.commandStepper(id, 0, 4.5); // Stop at 250 steps
    expect(stepperStepsAt(inputs(), id, 4.5)).toBe(250);
    expect(stepperStepsAt(inputs(), id, 60)).toBe(250);
    // The move stays on record as stopped partway, not completed.
    expect(inputs()[id]).toMatchObject({ cmdStart: 0, cmdGoal: 1000, cmdTarget: 250 });
    const { parts, at } = build("arduino-uno", "stepper-motor");
    const f = at(60, { [parts["stepper-motor"].id]: inputs()[id] });
    expect(reading(f, parts["stepper-motor"].id, "Done")).toBe("250 of 1000, stopped");
    expect(reading(f, parts["stepper-motor"].id, "Command")).toBe("Holding");
    store.commandStepper(id, 100, 61);
    expect(stepperStepsAt(inputs(), id, 70)).toBe(350);
  });

  it("changing the speed mid-move carries on from where the shaft is, with no jump", () => {
    const { id, inputs, store } = start();
    store.setInput(id, "stepsPerSecond", 100, 0);
    store.commandStepper(id, 1000, 0);
    expect(stepperStepsAt(inputs(), id, 2)).toBe(200);
    store.setInput(id, "stepsPerSecond", 400, 2);
    expect(stepperStepsAt(inputs(), id, 2)).toBe(200);
    expect(stepperStepsAt(inputs(), id, 3)).toBe(600);
    expect(stepperStepsAt(inputs(), id, 10)).toBe(1000);
    expect(inputs()[id]).toMatchObject({ cmdStart: 0, cmdTarget: 1000 });
  });

  it("the Inspector shows position, the last move and how much of it is done as separate readings", () => {
    const { parts, at } = build("arduino-uno", "stepper-motor");
    const s = parts["stepper-motor"].id;
    const f = at(1, set(s, { cmdStart: 0, cmdFrom: 0, cmdTarget: 200, cmdAt: 0, stepsPerSecond: 100 }));
    expect(Object.fromEntries(f.nodes[s].readings.map((r) => [r.label, r.value]))).toEqual({ Position: "18°", "Position (steps)": "100", Command: "100 steps to go clockwise", "Last move": "+200 steps", Done: "100 of 200" });
  });

  it("long runs stay bounded: the angle wraps; 1000 turns don't overflow", () => {
    const { parts, at } = build("arduino-uno", "stepper-motor");
    const s = parts["stepper-motor"].id;
    const f = at(1e6, set(s, { cmdFrom: 0, cmdTarget: 1000 * STEPPER_STEPS_PER_TURN, cmdAt: 0, stepsPerSecond: 1000 }));
    expect(reading(f, s, "Position (steps)")).toBe(String(1000 * STEPPER_STEPS_PER_TURN));
    expect(f.nodes[s].angle).toBe(0);
  });
});
