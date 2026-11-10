import { wired } from "../../../test/support/lab";
import { describe, expect, it } from "vitest";
import { analyze } from "../circuit";
import { planAutoWire } from "../autowire";
import { coerceInput, findControl } from "../controls";
import { frameAt } from "./";
import { boardSettings, planBoard, sampleSensor } from "../sketch";
import type { LabNode, LabWire, NodeInputs } from "../types";
import { getPart, withScreenText } from "../../parts";

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

const merge = (...all: Array<Record<string, NodeInputs>>) =>
  Object.assign({}, ...all) as Record<string, NodeInputs>;

const reading = (f: ReturnType<typeof frameAt>, id: string, label: string) =>
  f.nodes[id]!.readings.find((r) => r.label === label)?.value;

/** What the LCD model's glass shows: the screen:N text solids. */
const glass = (lines: string[]) =>
  withScreenText(getPart("lcd-16x2")!, lines)
    .solids.filter((s) => s.kind === "text" && /^screen:/.test(s.id ?? ""))
    .map((s) => (s as { text: string }).text);

describe("P0 · Experiment 03: DHT11 → sketch → LCD 16×2", () => {
  const temps = [0, 10, 24.5, 35, 50];
  const hums = [30, 80];

  for (const temperatureC of temps) {
    for (const humidity of hums) {
      it(`${temperatureC} °C, ${humidity} %: input → sensor → sketch → LCD → glass`, () => {
        const { board, parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
        const dht = parts.dht11;
        const lcd = parts["lcd-16x2"];
        const inputs = set(dht!.id, { temperatureC, humidity });
        // 1. The configured input (the store's coercion keeps it as given: it's in range and on the step).
        expect(coerceInput(findControl("dht11", "temperatureC")!, temperatureC)).toBe(temperatureC);
        expect(coerceInput(findControl("dht11", "humidity")!, humidity)).toBe(humidity);
        // 2. The sensor's reading.
        const sample = sampleSensor(dht!, 3, inputs, boardSettings(board.id, inputs));
        expect(sample.values).toEqual({ temperatureC, humidity });
        expect(sample.held).toBe(true);
        // 3. What the board's sketch reads.
        const plan = planBoard(board.id, [sample], inputs);
        expect(plan.samples[0]!.values.temperatureC).toBe(temperatureC);
        // 4. What the sketch writes to the display, and 5. what the glass shows.
        const f = at(3, inputs);
        const expected = [`Temp: ${temperatureC.toFixed(1)} °C`, `Hum: ${humidity} %`];
        expect(reading(f, dht!.id, "Temperature")).toBe(`${temperatureC.toFixed(1)} °C`);
        expect(f.nodes[lcd!.id]!.text).toEqual(expected);
        expect(expected.every((l) => l.length <= 16)).toBe(true);
        expect(glass(f.nodes[lcd!.id]!.text!)).toEqual(expected);
        expect(reading(f, lcd!.id, "Source")).toBe("DHT11 (set)");
      });
    }
  }

  it("follows a change made mid-run on the next frame, without a reload", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const { dht11: dht, "lcd-16x2": lcd } = parts;
    expect(at(5, set(dht!.id, { temperatureC: 10, humidity: 30 })).nodes[lcd!.id]!.text).toEqual([
      "Temp: 10.0 °C",
      "Hum: 30 %",
    ]);
    expect(at(5.1, set(dht!.id, { temperatureC: 50, humidity: 80 })).nodes[lcd!.id]!.text).toEqual([
      "Temp: 50.0 °C",
      "Hum: 80 %",
    ]);
    expect(at(5.2, set(dht!.id, { temperatureC: 0, humidity: 80 })).nodes[lcd!.id]!.text).toEqual([
      "Temp: 0.0 °C",
      "Hum: 80 %",
    ]);
  });

  it("isn't overwritten by other parts' updates", () => {
    const { board, parts, at } = build("arduino-uno", "dht11", "lcd-16x2", "led", "servo");
    const dht = set(parts.dht11!.id, { temperatureC: 35, humidity: 30 });
    const before = at(2, dht).nodes[parts["lcd-16x2"]!.id]!.text;
    const after = at(
      2,
      merge(dht, set(parts.servo!.id, { angle: 10 }), { [board.id]: { delayMs: 100 } }),
    ).nodes[parts["lcd-16x2"]!.id]!.text;
    expect(after).toEqual(before);
    expect(after).toEqual(["Temp: 35.0 °C", "Hum: 30 %"]);
  });

  it("rounds to the shown precision: one decimal for temperature, whole percent for humidity", () => {
    const { parts, at } = build("arduino-uno", "dht11", "lcd-16x2");
    const f = at(1, set(parts.dht11!.id, { temperatureC: 24.46, humidity: 55.6 }));
    expect(f.nodes[parts["lcd-16x2"]!.id]!.text).toEqual(["Temp: 24.5 °C", "Hum: 56 %"]);
  });

  it("says when the reading is simulated, and never shows sample text or a made-up value", () => {
    const { parts, at, nodes, wires } = build("arduino-uno", "dht11", "lcd-16x2");
    const lcd = parts["lcd-16x2"]!.id;
    const sweep = at(4);
    expect(reading(sweep, lcd, "Source")).toBe("DHT11 (simulated)");
    expect(sweep.nodes[lcd]!.text?.join("|")).not.toMatch(/24\.5 C|Hello/);
    expect(at(4, undefined, false).nodes[lcd]!.text).toEqual([]);
    expect(glass([])).toEqual(["", ""]);
    // The DHT11 loses its ground: the sketch gets no reading, and the LCD says so.
    const gnd = wires
      .filter((w) => w.from.node === parts.dht11!.id || w.to.node === parts.dht11!.id)
      .find((w) => [w.from.pin, w.to.pin].includes("GND"))!;
    const left = wires.filter((w) => w !== gnd);
    const broken = frameAt({
      nodes,
      wires: left,
      analysis: analyze(nodes, left),
      t: 4,
      running: true,
      inputs: set(parts.dht11!.id, { temperatureC: 50, humidity: 80 }),
    });
    expect(broken.nodes[lcd]!.text).toEqual(["DHT11: no data", "Check its wiring"]);
    expect(reading(broken, lcd, "Source")).toBe("DHT11 (no data)");
  });
});

describe("panels in every state", () => {
  const value = (live: { readings: Array<{ label: string; value: string }> }, label: string) =>
    live.readings.find((r) => r.label === label)?.value;

  it("a board says what its sketch does, and blinks its own LED when pin 13 is free", () => {
    const alone = wired("arduino-uno");
    expect(value(alone.at(0.25).nodes.board!, "Sketch")).toBe("Blink, delay 500 ms");
    expect(alone.at(0.25).nodes.board!.badge).toBe("L on");
    expect(alone.at(0.75).nodes.board!.badge).toBe("L off");
    expect(alone.at(0, { running: false }).nodes.board).toMatchObject({ badge: "Idle", level: 0 });
    expect(value(alone.at(0, { running: false }).nodes.board!, "Sketch")).toBe("Stopped");
    const withLed = wired("arduino-uno", "led");
    expect(withLed.at(0.25).nodes.board!.badge).toBe("Running");
    const reading = wired("arduino-uno", "dht11");
    expect(value(reading.at(1).nodes.board!, "Sketch")).toBe("Read and show");
    const alert = wired("arduino-uno", "hc-sr04", "led");
    expect(
      value(
        alert.at(1, { inputs: { "hc-sr04": { source: "set", distanceCm: 5 } } }).nodes.board!,
        "Sketch",
      ),
    ).toBe("hc-sr04 → outputs (on)");
    expect(
      value(
        alert.at(1, { inputs: { "hc-sr04": { source: "set", distanceCm: 300 } } }).nodes.board!,
        "Sketch",
      ),
    ).toBe("hc-sr04 → outputs (off)");
  });

  it("a shorted board is off", () => {
    const { nodes, wires } = wired("arduino-uno");
    const shorted = [
      ...wires,
      { id: "s", from: { node: "board", pin: "5V" }, to: { node: "board", pin: "GND1" } },
    ];
    const analysis = analyze(nodes, shorted);
    expect(
      frameAt({ nodes, wires: shorted, analysis, t: 1, running: true }).nodes.board,
    ).toMatchObject({ on: false, badge: "Off", readings: [{ value: "Off" }, {}, {}] });
  });

  it("radios come up, each in its own words, and say nothing when stopped", () => {
    const radios = wired("arduino-uno", "hc-05", "wifi-module", "nrf24l01", "lora");
    const early = radios.at(1);
    expect(value(early.nodes["hc-05"]!, "Status")).toBe("Discoverable");
    expect(value(early.nodes["wifi-module"]!, "Status")).toBe("Joining…");
    expect(early.nodes["hc-05"]!.badge).toBe("Pairing");
    const later = radios.at(4);
    expect(value(later.nodes["hc-05"]!, "Status")).toBe("Paired");
    expect(value(later.nodes["wifi-module"]!, "Status")).toBe("Connected, 192.168.4.2");
    expect(value(later.nodes.nrf24l01!, "Status")).toBe("16 packets sent");
    expect(value(later.nodes.lora!, "Status")).toBe("2 packets, RSSI −87 dBm");
    expect(radios.at(4, { running: false }).nodes["hc-05"]).toMatchObject({
      badge: "Idle",
      readings: [],
    });
  });

  it("a display shows its board's sensors, and names the ones giving no data", () => {
    const { nodes, wires } = wired("arduino-uno", "dht11", "lcd-16x2", "ldr");
    const noLdrPower = wires.filter((w) => !(w.to.node === "ldr" && w.to.pin === "L1"));
    const analysis = analyze(nodes, noLdrPower);
    const lcd = frameAt({ nodes, wires: noLdrPower, analysis, t: 1, running: true }).nodes[
      "lcd-16x2"
    ]!;
    expect(lcd.badge).toBe("Showing");
    expect(value(lcd, "Source")).toBe("dht11 (simulated), ldr (no data)");
    expect(lcd.text!.length).toBeGreaterThan(0);
    expect(
      frameAt({ nodes, wires: noLdrPower, analysis, t: 1, running: false }).nodes["lcd-16x2"],
    ).toMatchObject({ badge: "Blank", text: [], readings: [] });
    const alone = wired("arduino-uno", "oled-ssd1306");
    expect(value(alone.at(1).nodes["oled-ssd1306"]!, "Source")).toBe("No sensor on this board");
  });

  it("a breadboard lists what each wired strip carries, rails first", () => {
    const { nodes, wires } = wired("arduino-uno", "breadboard", "dht11");
    const extra = [
      ...wires,
      { id: "x", from: { node: "breadboard", pin: "a30" }, to: { node: "breadboard", pin: "a30" } },
    ];
    const live = frameAt({
      nodes,
      wires: extra,
      analysis: analyze(nodes, extra),
      t: 1,
      running: true,
    }).nodes.breadboard!;
    expect(live.badge).toBe("5 V · GND");
    expect(live.readings[0]!.label).toMatch(/rail$/);
    expect(live.readings.map((r) => r.value)).toEqual(expect.arrayContaining(["5 V rail", "GND"]));
  });

  it("other parts just say whether they run", () => {
    const { at } = wired("arduino-uno", "mpu6050");
    expect(at(1).nodes.mpu6050).toMatchObject({ on: true }); // a sensor: readings of its own
  });
});
