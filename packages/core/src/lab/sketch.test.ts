import { describe, expect, it } from "vitest";
import { analyze, type Analysis } from "./circuit";
import { planAutoWire } from "./autowire";
import { controlsFor, coerceInput, findControl } from "./controls";
import { frameAt } from "./simulate";
import { alertOf, boardSettings, displayLines, planBoard, sampleSensor } from "./sketch";
import type { LabNode, LabWire, NodeInputs } from "./types";
import { getPart, hasScreen, withScreenText } from "../parts";

let seq = 0;

const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({
  id: `n${++seq}`,
  partId,
  label: label ?? partId,
  x,
  y,
  mode: "virtual",
});

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
    wires = [
      ...wires,
      ...planAutoWire(n, nodes, wires).wires.map((w) => ({ id: `w${++seq}`, ...w })),
    ];
  }
  const analysis: Analysis = analyze(nodes, wires);
  const at = (t: number, inputs?: Record<string, NodeInputs>, running = true) =>
    frameAt({ nodes, wires, analysis, t, running, inputs });
  return { board, parts, nodes, wires, analysis, at };
}

const set = (nodeId: string, values: NodeInputs): Record<string, NodeInputs> => ({
  [nodeId]: { source: "set", ...values },
});

/** Rising edges of a part's level in [t0, t1), sampled every 50 ms. */
function blinks(
  at: (t: number) => ReturnType<typeof frameAt>,
  id: string,
  t0: number,
  t1: number,
): number {
  let count = 0;
  let prev = 0;
  for (let t = t0; t < t1; t = Math.round((t + 0.05) * 1000) / 1000) {
    const level = at(t).nodes[id]!.level;
    if (level > 0 && prev === 0) count += 1;
    prev = level;
  }
  return count;
}

describe("Experiment 01: blinking LED", () => {
  it("blinks at the sketch's delay: period = 2 × delay, and the rate follows the setting", () => {
    const { board, parts, at } = build("arduino-uno", "led");
    const led = parts.led!.id;
    // Default 500 ms delay → 1 s period: on for the first half.
    expect(at(0.1).nodes[led]!.level).toBe(1);
    expect(at(0.6).nodes[led]!.level).toBe(0);
    expect(at(1.1).nodes[led]!.level).toBe(1);
    expect(blinks((t) => at(t), led, 0, 10)).toBe(10);
    // 250 ms → twice as fast; 1000 ms → half as fast.
    expect(blinks((t) => at(t, { [board.id]: { delayMs: 250 } }), led, 0, 10)).toBe(20);
    expect(blinks((t) => at(t, { [board.id]: { delayMs: 1000 } }), led, 0, 10)).toBe(5);
    const slow = at(0.5, { [board.id]: { delayMs: 1000 } });
    expect(slow.nodes[led]!.level).toBe(1);
    expect(at(1.5, { [board.id]: { delayMs: 1000 } }).nodes[led]!.level).toBe(0);
    expect(slow.nodes[led]!.readings.find((r) => r.label === "Sketch")?.value).toBe(
      "Blinking, 1000 ms",
    );
    expect(slow.nodes[board.id]!.readings.find((r) => r.label === "Sketch")?.value).toBe(
      "Blink, delay 1000 ms",
    );
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
    const us = parts["hc-sr04"]!.id;
    expect(at(1, set(us, { distanceCm: 123 })).nodes[us]!.readings[0]).toEqual({
      label: "Distance",
      value: "123.0 cm",
    });
    const control = findControl("hc-sr04", "distanceCm")!;
    expect(coerceInput(control, 1000)).toBe(400);
    expect(coerceInput(control, -5)).toBe(2);
    expect(coerceInput(control, Number.NaN)).toBeNull();
  });

  it("the simulated sweep stays within 30–50 cm; it never grows without limit", () => {
    const { parts, at } = build("arduino-uno", "hc-sr04");
    const us = parts["hc-sr04"]!.id;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 120; t += 0.5) {
      const d = Number.parseFloat(at(t).nodes[us]!.readings[0]!.value);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    expect(min).toBeGreaterThanOrEqual(30);
    expect(max).toBeLessThanOrEqual(50);
  });

  it("switches the LED and buzzer on below the warning distance, off above it, and off at exactly the threshold", () => {
    const { board, parts, at } = build("arduino-uno", "hc-sr04", "led", "buzzer");
    const us = parts["hc-sr04"]!.id;
    const led = parts.led!.id;
    const buzzer = parts.buzzer!.id;
    const warnCm = 20;
    const state = (distanceCm: number, t = 0.1) => {
      const f = at(t, { ...set(us, { distanceCm }), [board.id]: { warnCm } });
      return {
        distance: f.nodes[us]!.readings[0]!.value,
        led: f.nodes[led]!.level,
        buzzer: f.nodes[buzzer]!.badge,
        obstacle: f.nodes[us]!.readings[1]!.value,
      };
    };
    expect(state(30)).toEqual({ distance: "30.0 cm", led: 0, buzzer: "Quiet", obstacle: "Clear" });
    expect(state(10)).toEqual({
      distance: "10.0 cm",
      led: 1,
      buzzer: "BEEP",
      obstacle: "Closer than 20 cm",
    });
    // The comparison is strict: at the threshold the way is still clear.
    expect(state(20)).toEqual({ distance: "20.0 cm", led: 0, buzzer: "Quiet", obstacle: "Clear" });
    expect(state(19.9).led).toBe(1);
    // Crossing both ways is repeatable, at any time.
    expect(state(10, 7.3).led).toBe(1);
    expect(state(30, 7.3).led).toBe(0);
    expect(state(10, 12).led).toBe(1);
    // The buzzer beeps rather than holding a tone: on and off within a cycle.
    const beeping = { ...set(us, { distanceCm: 5 }), [board.id]: { warnCm } };
    expect(at(0.1, beeping).nodes[buzzer]!.level).toBe(1);
    expect(at(0.2, beeping).nodes[buzzer]!.level).toBe(0);
    // A changed threshold moves the boundary.
    expect(
      at(0.1, { ...set(us, { distanceCm: 30 }), [board.id]: { warnCm: 40 } }).nodes[led]!.level,
    ).toBe(1);
  });
});

describe("Experiment 03: DHT11 with an LCD 16×2", () => {
  it("shows the temperature and humidity the sensor reads, on separate lines, within 16 characters", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const dht = parts.dht11!.id;
    const lcd = parts["lcd-16x2"]!.id;
    const cases: Array<[number, number, string[]]> = [
      [23.8, 60, ["Temp: 23.8 °C", "Hum: 60 %"]],
      [24.9, 45, ["Temp: 24.9 °C", "Hum: 45 %"]],
      [25, 71, ["Temp: 25.0 °C", "Hum: 71 %"]],
    ];
    for (const [temperatureC, humidity, lines] of cases) {
      const f = at(2, set(dht, { temperatureC, humidity }));
      // 1. the sensor, 2. what the display-writing path received, 3. the glass.
      expect(f.nodes[dht]!.readings.map((r) => r.value)).toEqual([
        `${temperatureC.toFixed(1)} °C`,
        `${humidity} %`,
      ]);
      expect(f.nodes[lcd]!.readings[0]).toEqual({ label: "Showing", value: lines.join(" · ") });
      expect(f.nodes[lcd]!.text).toEqual(lines);
      expect(f.nodes[lcd]!.text!.every((l) => l.length <= 16)).toBe(true);
    }
  });

  it("updates on the next frame when the value changes mid-run, and never shows the library's sample text", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const dht = parts.dht11!.id;
    const lcd = parts["lcd-16x2"]!.id;
    expect(at(5, set(dht, { temperatureC: 23.8, humidity: 60 })).nodes[lcd]!.text?.[0]).toBe(
      "Temp: 23.8 °C",
    );
    expect(at(5.1, set(dht, { temperatureC: 24.9, humidity: 60 })).nodes[lcd]!.text?.[0]).toBe(
      "Temp: 24.9 °C",
    );
    const model = getPart("lcd-16x2")!;
    expect(hasScreen(model)).toBe(true);
    const written = withScreenText(model, ["Temp: 24.9 °C", "Hum: 60 %"]);
    const lines = written.solids
      .filter((s) => s.kind === "text" && s.id?.startsWith("screen:"))
      .map((s) => (s as { text: string }).text);
    expect(lines).toEqual(["Temp: 24.9 °C", "Hum: 60 %"]);
    const blank = withScreenText(model, []);
    expect(
      blank.solids
        .filter((s) => s.kind === "text" && s.id?.startsWith("screen"))
        .every((s) => (s as { text: string }).text === ""),
    ).toBe(true);
    expect(withScreenText(model, ["a", "b"])).toBe(
      written.solids === withScreenText(model, ["Temp: 24.9 °C", "Hum: 60 %"]).solids
        ? withScreenText(model, ["a", "b"])
        : withScreenText(model, ["a", "b"]),
    );
  });

  it("follows the simulated sweep when nothing is set, and is blank when the sketch isn't running or the sensor is off", () => {
    const { parts, at, nodes, wires } = build("arduino-uno", "dht11", "lcd-16x2");
    const dht = parts.dht11!.id;
    const lcd = parts["lcd-16x2"]!.id;
    const a = at(3);
    const b = at(9);
    expect(a.nodes[lcd]!.text?.[0]).toBe(`Temp: ${a.nodes[dht]!.readings[0]!.value}`);
    expect(b.nodes[lcd]!.text?.[0]).not.toBe(a.nodes[lcd]!.text?.[0]);
    expect(at(3, undefined, false).nodes[lcd]!.text).toEqual([]);
    // Unwire the sensor: the LCD shows it has nothing to show, not a made-up temperature.
    const without = wires.filter((w) => w.from.node !== dht && w.to.node !== dht);
    const f = frameAt({
      nodes,
      wires: without,
      analysis: analyze(nodes, without),
      t: 3,
      running: true,
    });
    expect(f.nodes[lcd]!.text).toEqual(["Hello, Kiungo!", "Up 3 s"]);
    expect(f.nodes[lcd]!.readings[1]).toEqual({
      label: "Source",
      value: "No sensor on this board",
    });
  });

  it("formats other displays to their own width and depth", () => {
    const dht = node("dht22", 0, 0, "DHT22");
    const sample = sampleSensor(
      dht,
      0,
      set(dht.id, { temperatureC: -3.5, humidity: 100 }),
      boardSettings(null, undefined),
    );
    expect(displayLines("oled-ssd1306", [sample], 0)).toEqual(["Temp: -3.5 °C", "Hum: 100 %"]);
    expect(displayLines("lcd-16x2", [], 12)).toEqual(["Hello, Kiungo!", "Up 12 s"]);
  });
});

describe("Experiment 04: motion-activated gate", () => {
  it("holds the motion state you set, and opens or rests the servo and LED by the sketch's gate policy", () => {
    const { board, parts, at } = build("arduino-uno", "pir", "servo", "led");
    const pir = parts.pir!.id;
    const servo = parts.servo!.id;
    const led = parts.led!.id;
    const state = (motion: boolean, t: number, settings: NodeInputs = {}) => {
      const f = at(t, { ...set(pir, { motion }), [board.id]: settings });
      return {
        pir: f.nodes[pir]!.readings[0]!.value,
        angle: f.nodes[servo]!.angle,
        led: f.nodes[led]!.level,
        command: f.nodes[servo]!.readings[1]?.value,
      };
    };
    // 1. no motion → motion; 2. motion → no motion; 3. none → none; 4. detected → stays detected.
    expect(state(false, 1)).toEqual({
      pir: "None",
      angle: 0,
      led: 0,
      command: "Rest (0°): no motion",
    });
    expect(state(true, 2)).toEqual({
      pir: "Detected",
      angle: 90,
      led: 1,
      command: "Open (90°): motion seen",
    });
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
    const pir = parts.pir!.id;
    const servo = parts.servo!.id;
    const inputs = set(pir, { motion: true });
    expect(at(4, inputs).nodes[servo]!.angle).toBe(90);
    expect(at(4, inputs, false).nodes[servo]!.angle).toBe(90);
    expect(at(4.1, inputs).nodes[servo]!.angle).toBe(90);
    // The servo has no command of its own while a PIR drives it.
    const { nodes, analysis } = build("arduino-uno", "pir", "servo");
    const servoNode = nodes.find((n) => n.partId === "servo")!;
    expect(controlsFor(servoNode, nodes, analysis)).toMatchObject({
      title: "Command",
      controls: [],
    });
    expect(controlsFor(servoNode, nodes, analysis).note).toMatch(
      /Driven by the sketch from the PIR sensor/,
    );
  });

  it("without a PIR, a servo holds the angle you set, or sweeps only in the simulated mode", () => {
    const { parts, at } = build("arduino-uno", "servo");
    const servo = parts.servo!.id;
    expect(at(1, set(servo, { angle: 45 })).nodes[servo]!.angle).toBe(45);
    expect(at(7, set(servo, { angle: 45 })).nodes[servo]!.angle).toBe(45);
    expect(at(1).nodes[servo]!.readings[1]!.value).toBe("Sweep (simulated)");
  });

  it("the simulated PIR, when nothing is set, follows its documented 8 s cycle", () => {
    const { parts, at } = build("arduino-uno", "pir");
    const pir = parts.pir!.id;
    expect(at(1).nodes[pir]!.readings[0]!.value).toBe("Detected");
    expect(at(5).nodes[pir]!.readings[0]!.value).toBe("None");
    expect(at(9).nodes[pir]!.readings[0]!.value).toBe("Detected");
  });
});

describe("every sensor the sketch reads", () => {
  const settings = boardSettings(null, undefined);
  const read = (partId: string, t: number, values?: NodeInputs) => {
    const n = node(partId);
    return sampleSensor(n, t, values ? set(n.id, values) : undefined, settings);
  };

  it("holds the values you set, and sweeps within its range when nothing is set", () => {
    const cases: Array<[string, NodeInputs, string, [number, number]]> = [
      ["ds18b20", { temperatureC: 30 }, "temperatureC", [23, 26]],
      ["ldr", { light: 12 }, "light", [0, 100]],
      ["soil-moisture", { moisture: 10 }, "moisture", [20, 60]],
      ["mq2", { gasPpm: 900 }, "gasPpm", [300, 550]],
      ["mpu6050", { pitch: 40, roll: -5 }, "pitch", [-25, 25]],
      ["bmp280", { pressureHpa: 990, temperatureC: 18 }, "pressureHpa", [1011.7, 1014.7]],
      ["dht22", { temperatureC: 21, humidity: 70 }, "temperatureC", [15, 35]],
    ];
    for (const [partId, values, key, [lo, hi]] of cases) {
      const held = read(partId, 7, values);
      expect(held.held, partId).toBe(true);
      expect(held.values[key], partId).toBe(values[key]);
      for (const t of [0, 3.3, 17, 61]) {
        const swept = read(partId, t).values[key]!;
        expect(swept, `${partId} at ${t}`).toBeGreaterThanOrEqual(lo);
        expect(swept, `${partId} at ${t}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("says when a threshold is crossed, by the board's setting", () => {
    expect(read("soil-moisture", 0, { moisture: 10 }).readings[1]!.value).toBe("Dry");
    expect(read("soil-moisture", 0, { moisture: 80 }).readings[1]!.value).toBe("Wet enough");
    expect(read("mq2", 0, { gasPpm: 9000 }).readings[1]!.value).toBe("Over threshold");
    expect(read("mq2", 0, { gasPpm: 1 }).readings[1]!.value).toBe("Normal");
    expect(read("bmp280", 0, { pressureHpa: 1013.25 }).readings[2]).toEqual({
      label: "Altitude",
      value: "0.0 m",
    });
    expect(read("mpu6050", 0, { pitch: 0 }).readings[2]).toEqual({
      label: "Accel Z",
      value: "1.00 g",
    });
  });

  it("a part that isn't a sensor reads nothing", () => {
    expect(read("led", 1)).toMatchObject({ readings: [], values: {}, level: 0, on: false });
  });

  it("each alert follows its own sensor and setting; other sensors have none", () => {
    const alert = (partId: string, values: NodeInputs) =>
      alertOf(read(partId, 0, values), settings);
    expect(alert("hc-sr04", { distanceCm: 5 })).toBe(true);
    expect(alert("hc-sr04", { distanceCm: 300 })).toBe(false);
    expect(alert("pir", { motion: true })).toBe(true);
    expect(alert("pir", { motion: false })).toBe(false);
    expect(alert("mq2", { gasPpm: 9000 })).toBe(true);
    expect(alert("soil-moisture", { moisture: 1 })).toBe(true);
    expect(alert("ldr", { light: 1 })).toBe(true);
    expect(alert("ldr", { light: 99 })).toBe(false);
    expect(alert("dht11", { temperatureC: 50 })).toBeNull();
    const empty = { ...read("ldr", 0), values: {} };
    expect(alertOf(empty, settings)).toBe(false);
  });

  it("the board plan follows the first alert sensor, and the PIR's motion", () => {
    const pir = read("pir", 0, { motion: true });
    const ldr = read("ldr", 0, { light: 1 });
    expect(planBoard(null, [read("dht11", 0), ldr, pir], undefined)).toMatchObject({
      alertSensor: ldr,
      alert: true,
      motion: true,
    });
    expect(planBoard(null, [read("dht11", 0)], undefined)).toMatchObject({
      alertSensor: null,
      alert: false,
      motion: null,
    });
  });
});

describe("what a display shows when it can't show a reading", () => {
  it("names the sensor that gave no data, cut to the screen", () => {
    expect(displayLines("lcd-16x2", [], 3, ["Temperature sensor"])).toEqual([
      "Temperature sens",
      "Check its wiring",
    ]);
    expect(displayLines("unknown-screen", [], 12.4)).toEqual(["Hello, Kiungo!", "Up 12 s"]);
  });

  it("drops threshold lines first when the screen is too small for everything", () => {
    const s = (partId: string, values: NodeInputs) => {
      const n = node(partId);
      return sampleSensor(n, 0, set(n.id, values), boardSettings(null, undefined));
    };
    const lines = displayLines(
      "lcd-16x2",
      [s("soil-moisture", { moisture: 10 }), s("mq2", { gasPpm: 1 })],
      0,
    );
    expect(lines).toEqual(["Soil: 10 %", "Gas: 1 ppm"]);
    const big = displayLines("oled-ssd1306", [s("soil-moisture", { moisture: 10 })], 0);
    expect(big).toEqual(["Soil: 10 %", "Soil: Dry"]);
  });
});
