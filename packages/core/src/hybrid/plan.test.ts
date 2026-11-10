// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import { arduinoPinOf, peripheralInputs, programFrame } from "../lab/program";
import { frameAt } from "../lab/simulate";
import { buildStarter } from "../project";
import {
  boardIsReal,
  hybridBindings,
  hybridValues,
  outReadings,
  packDht,
  parsePlan,
  type Binding,
  type HybridBindings,
} from "./plan";
import { wired } from "../../test/support/lab";
import type { PeripheralInput } from "../emulator/peripherals";
import { generateShim } from "./shim";
import { decodeFrame, Frame } from "./protocol";
import { ECHO_US_PER_CM } from "../emulator/peripherals";

function setup(starter: string, mode: "virtual" | "physical" = "virtual") {
  const { session } = buildStarter({ name: "x", board: "arduino-uno", starter });
  const nodes = session.nodes.map((n, i) =>
    i === 0 ? { ...n, mode: "physical" as const } : { ...n, mode },
  );
  const analysis = analyze(nodes, session.wires, session.inputs);
  return { session: { ...session, nodes }, nodes, analysis, board: nodes[0]! };
}

describe("which parts Kiungo plays on a real board (RUN-01, RUN-04)", () => {
  it("a board marked Physical or Hybrid runs the code for real", () => {
    const { board } = setup("blink");
    expect(boardIsReal(board)).toBe(true);
    expect(boardIsReal({ ...board, mode: "virtual" })).toBe(false);
    expect(boardIsReal(undefined)).toBe(false);
  });

  it("a virtual HC-SR04 answers NewPing on its trigger pin and pulseIn on its echo pin", () => {
    const { nodes, analysis, board } = setup("distance");
    const sensor = nodes.find((n) => n.partId === "hc-sr04")!;
    const links = analysis.nodes[sensor.id]!.links;
    const trig = arduinoPinOf(links.find((l) => l.pin === "TRIG")!.boardPin)!;
    const echo = arduinoPinOf(links.find((l) => l.pin === "ECHO")!.boardPin)!;
    const b = hybridBindings(nodes, analysis, board!.id, "arduino:avr:nano:cpu=atmega328");
    expect(b.plan.board).toBe("arduino:avr:nano:cpu=atmega328");
    expect(b.sensors.map((s) => s.binding)).toEqual([
      { kind: "distance-cm", pin: trig },
      { kind: "echo-us", pin: echo },
    ]);
    expect(b.plan.sensors).toEqual([
      { id: 0, part: "hc-sr04", pins: [trig], adapter: "NewPing" },
      { id: 1, part: "hc-sr04", pins: [echo] },
    ]);
    // The plan makes a valid shim, with the NewPing adapter.
    expect(generateShim(b.plan).adapters).toEqual(["NewPing"]);
    const inputs = [{ id: sensor.id, kind: "hc-sr04" as const, trig, echo, distanceCm: 42.4 }];
    expect(hybridValues(b, inputs)).toEqual([
      [0, 42],
      [1, Math.round(42.4 * ECHO_US_PER_CM)],
    ]);
    // Out of range: NewPing says 0, the echo times out.
    expect(
      hybridValues(b, [{ id: sensor.id, kind: "hc-sr04", trig, echo, distanceCm: 900 }]),
    ).toEqual([
      [0, 0],
      [1, 38_000],
    ]);
  });

  it("the same HC-SR04 marked Physical is the real one: nothing is played", () => {
    const { nodes, analysis, board } = setup("distance", "physical");
    const b = hybridBindings(nodes, analysis, board!.id);
    expect(b.sensors).toEqual([]);
    expect(b.physical.map((n) => n.partId)).toContain("hc-sr04");
  });

  it("a virtual DHT11 is played through the DHT adapter, in tenths", () => {
    const { nodes, analysis, board, session } = setup("dht11");
    const b = hybridBindings(nodes, analysis, board!.id);
    expect(b.plan.sensors).toMatchObject([{ part: "dht11", adapter: "DHT" }]);
    const { inputs } = peripheralInputs({
      nodes,
      analysis,
      inputs: session.inputs,
      boardId: board!.id,
      t: 0,
    });
    const [[, value] = []] = hybridValues(b, inputs);
    const dht = inputs.find((i) => i.kind === "dht")!;
    expect(dht.kind === "dht" && value).toBe(packDht(dht.temperatureC, dht.humidity));
    expect(packDht(23.4, 55)).toBe((234 << 16) | 550);
    expect(packDht(-5, 40) >> 16).toBe(-50);
  });

  it("outputs stay real: an LED is on the desk, not played", () => {
    const { nodes, analysis, board } = setup("blink");
    const b = hybridBindings(nodes, analysis, board!.id);
    expect(b.sensors).toEqual([]);
    expect(b.physical.map((n) => n.partId)).toContain("led");
  });
});

describe("a plan from the interface is checked before it reaches the header", () => {
  it("passes a plain plan and sets the board", () => {
    const r = parsePlan(
      { board: "anything", sensors: [{ id: 0, part: "hc-sr04", pins: [9], adapter: "NewPing" }] },
      "arduino:avr:uno",
    );
    expect(r).toEqual({
      ok: true,
      plan: {
        board: "arduino:avr:uno",
        sensors: [{ id: 0, part: "hc-sr04", pins: [9], adapter: "NewPing" }],
      },
    });
  });

  it("refuses part ids that would break out of the header's comment", () => {
    expect(
      parsePlan(
        { sensors: [{ id: 0, part: "ldr\n#define Serial x", pins: [14] }] },
        "arduino:avr:uno",
      ).ok,
    ).toBe(false);
    expect(
      parsePlan(
        { sensors: [{ id: 0, part: "ldr", pins: [14], adapter: "../../etc" }] },
        "arduino:avr:uno",
      ).ok,
    ).toBe(false);
  });

  it("refuses pins the board doesn't have, shared pins and too many sensors", () => {
    expect(
      parsePlan({ sensors: [{ id: 0, part: "ldr", pins: [40] }] }, "arduino:avr:uno"),
    ).toMatchObject({ ok: false, message: "Pin 40 doesn't exist on this board." });
    expect(
      parsePlan(
        {
          sensors: [
            { id: 0, part: "ldr", pins: [14] },
            { id: 1, part: "pir", pins: [14] },
          ],
        },
        "arduino:avr:uno",
      ).ok,
    ).toBe(false);
    expect(
      parsePlan(
        { sensors: Array.from({ length: 9 }, (_, i) => ({ id: i, part: "pir", pins: [i] })) },
        "arduino:avr:uno",
      ).ok,
    ).toBe(false);
    expect(parsePlan(null, "arduino:avr:uno").ok).toBe(false);
  });
});

describe("what the real board drove, in the lab (OUT-01)", () => {
  it("decodes OUT frames: levels, the written pins and PWM", () => {
    // levels: pin 13 high; driven: pins 5 and 13; then pin 5 at PWM 128.
    const frame = decodeFrame(
      new Uint8Array([Frame.Out, 0, 0x20, 0, 0, 1 << 5, 0x20, 0, 0, 5, 128]),
    );
    expect(frame).toEqual({
      type: "out",
      levels: 1 << 13,
      driven: (1 << 13) | (1 << 5),
      pwm: [[5, 128]],
    });
  });

  it("written pins become readings; pins never written are left to the lab", () => {
    const r = outReadings({
      levels: 1 << 13,
      driven: (1 << 13) | (1 << 5) | (1 << 7),
      pwm: [[5, 128]],
    });
    expect(r).toEqual([
      { pin: 5, level: "high", duty: 128 / 255, hz: 0, pulseUs: null },
      { pin: 7, level: "low", duty: 0, hz: 0, pulseUs: null },
      { pin: 13, level: "high", duty: 1, hz: 0, pulseUs: null },
    ]);
  });

  it("the board says it runs on the real board, and the LED mirrors pin 13", () => {
    const { session, nodes, analysis, board } = setup("blink");
    const base = frameAt({
      nodes,
      wires: session.wires,
      analysis,
      t: 1,
      running: true,
      inputs: session.inputs,
    });
    const frame = programFrame(base, nodes, session.wires, analysis, {
      boardId: board!.id,
      t: 2,
      speedPercent: 100,
      crashed: null,
      pins: outReadings({ levels: 1 << 13, driven: 1 << 13, pwm: [] }),
      where: "Arduino Uno on COM3",
    });
    expect(frame.nodes[board!.id]).toMatchObject({ badge: "On board" });
    expect(frame.nodes[board!.id]!.readings).toContainEqual({
      label: "Runs on",
      value: "The real Arduino Uno on COM3",
    });
    expect(frame.nodes[nodes[1]!.id]).toMatchObject({ on: true, badge: "ON" });
  });
});

describe("every sensor Kiungo can play on a real board", () => {
  /** An Uno marked Physical with `parts` auto-wired, plus `extra` wires ("D4>soil-moisture.D0"). */
  function bench(parts: string[], extra: string[] = []) {
    const { nodes, wires } = wired("arduino-uno", ...parts);
    const more = extra.map((spec, i) => {
      const [pin, to] = spec.split(">") as [string, string];
      const [node, toPin] = to.split(".") as [string, string];
      return { id: `x${i}`, from: { node: "board", pin }, to: { node, pin: toPin } };
    });
    const real = nodes.map((n) => (n.id === "board" ? { ...n, mode: "physical" as const } : n));
    return { nodes: real, analysis: analyze(real, [...wires, ...more]) };
  }

  it("binds PIR, LDR, soil moisture and MQ-2 to the pins they're wired to", () => {
    const { nodes, analysis } = bench(
      ["pir", "ldr", "soil-moisture", "mq2", "dht22"],
      ["D4>soil-moisture.D0", "D5>mq2.D0"],
    );
    const b = hybridBindings(nodes, analysis, "board");
    const kinds = b.sensors.map((s) => `${s.inputId}:${s.binding.kind}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "pir:digital",
        "ldr:analog",
        "soil-moisture:A0:analog",
        "soil-moisture:D0:digital",
        "mq2:A0:analog",
        "mq2:D0:digital",
        "dht22:dht",
      ]),
    );
    expect(b.sensors.find((s) => s.inputId === "dht22")!.binding).toMatchObject({ model: 22 });
    expect(b.plan.sensors.find((s) => s.part === "dht22")).toMatchObject({ adapter: "DHT" });
    expect(b.plan.sensors.find((s) => s.part === "pir")).not.toHaveProperty("adapter");
  });

  it("can't play I²C and 1-Wire sensors yet, and says so", () => {
    const { nodes, analysis } = bench(["mpu6050", "ds18b20"]);
    const b = hybridBindings(nodes, analysis, "board");
    expect(b.sensors).toEqual([]);
    expect(b.unsupported.map((u) => u.node.partId).sort()).toEqual(["ds18b20", "mpu6050"]);
    expect(b.unsupported[0]!.why).toMatch(/Mark it Physical/);
  });

  it("refuses more virtual sensor pins than the runtime holds", () => {
    const { nodes, analysis } = bench([
      "pir",
      "pir",
      "pir",
      "pir",
      "pir",
      "pir",
      "pir",
      "pir",
      "pir",
    ]);
    expect(() => hybridBindings(nodes, analysis, "board")).toThrow(/up to \d+ virtual sensor pins/);
  });

  it("parts not wired to this board are left out", () => {
    const { nodes, analysis } = bench(["pir"]);
    const loose = { id: "far", partId: "pir", label: "far", x: 0, y: 0, mode: "virtual" as const };
    const b = hybridBindings([...nodes, loose], analysis, "board");
    expect(b.sensors.map((s) => s.nodeId)).toEqual(["pir"]);
  });
});

describe("the values pushed for each reading", () => {
  const bindings = (binding: Binding): HybridBindings => ({
    plan: { board: "x", sensors: [] },
    sensors: [{ id: 3, nodeId: "n", inputId: "n", binding }],
    unsupported: [],
    physical: [],
  });
  const push = (binding: Binding, input: Record<string, unknown>, logicV?: number) =>
    hybridValues(bindings(binding), [{ id: "n", ...input } as PeripheralInput], logicV);

  it("distances in cm and echoes in µs, with out-of-range as no echo", () => {
    expect(push({ kind: "distance-cm", pin: 9 }, { kind: "hc-sr04", distanceCm: 42.4 })).toEqual([
      [3, 42],
    ]);
    expect(push({ kind: "distance-cm", pin: 9 }, { kind: "hc-sr04", distanceCm: 900 })).toEqual([
      [3, 0],
    ]);
    expect(push({ kind: "echo-us", pin: 10 }, { kind: "hc-sr04", distanceCm: 1 })).toEqual([
      [3, 38_000],
    ]);
    expect(push({ kind: "echo-us", pin: 10 }, { kind: "hc-sr04", distanceCm: 10 })).toEqual([
      [3, Math.round(10 * ECHO_US_PER_CM)],
    ]);
  });

  it("digital as 0/1, analog scaled to the board's logic and clamped", () => {
    expect(push({ kind: "digital", pin: 2 }, { kind: "digital", high: true })).toEqual([[3, 1]]);
    expect(push({ kind: "digital", pin: 2 }, { kind: "digital", high: false })).toEqual([[3, 0]]);
    expect(push({ kind: "analog", pin: 14 }, { kind: "analog", volts: 2.5 })).toEqual([[3, 512]]);
    expect(push({ kind: "analog", pin: 14 }, { kind: "analog", volts: 1.65 }, 3.3)).toEqual([
      [3, 512],
    ]);
    expect(push({ kind: "analog", pin: 14 }, { kind: "analog", volts: 9 })).toEqual([[3, 1023]]);
    expect(push({ kind: "analog", pin: 14 }, { kind: "analog", volts: -1 })).toEqual([[3, 0]]);
  });

  it("nothing for a reading of the wrong kind, or no reading", () => {
    expect(push({ kind: "analog", pin: 14 }, { kind: "digital", high: true })).toEqual([]);
    expect(push({ kind: "dht", pin: 2, model: 11 }, { kind: "hc-sr04", distanceCm: 5 })).toEqual(
      [],
    );
    expect(hybridValues(bindings({ kind: "digital", pin: 2 }), [])).toEqual([]);
  });

  it("packs DHT readings in tenths, clamped to the sensor's range", () => {
    expect(packDht(-60, -5)).toBe(((-400 & 0xffff) << 16) | 0);
    expect(packDht(100, 120)).toBe((800 << 16) | 1000);
  });
});

describe("every way a plan from the interface is refused", () => {
  const sensor = (over: Record<string, unknown>) =>
    parsePlan({ sensors: [{ id: 0, part: "ldr", pins: [14], ...over }] }, "arduino:avr:uno");
  it("names what's wrong with the sensor", () => {
    expect(parsePlan({ sensors: [null] }, "u")).toEqual({
      ok: false,
      message: "Refused: that isn't a Hybrid plan.",
    });
    expect(parsePlan({ sensors: "no" }, "u").ok).toBe(false);
    expect(sensor({ part: 7 })).toMatchObject({
      message: "Refused: a part in the plan has an unknown id.",
    });
    expect(sensor({ pins: "14" })).toMatchObject({
      message: "Refused: a part in the plan has bad pins.",
    });
    expect(sensor({ pins: [1, 2, 3, 4, 5] })).toMatchObject({
      message: "Refused: a part in the plan has bad pins.",
    });
    expect(sensor({ pins: [1.5] })).toMatchObject({
      message: "Refused: a part in the plan has bad pins.",
    });
    expect(sensor({ id: "0" })).toMatchObject({
      message: "Refused: a part in the plan has a bad id.",
    });
    expect(sensor({ adapter: "DHT" })).toMatchObject({ ok: true });
  });

  it("PWM duty becomes a level at half", () => {
    expect(outReadings({ levels: 0, driven: 0b1000, pwm: [[3, 100]] })).toEqual([
      { pin: 3, level: "low", duty: 100 / 255, hz: 0, pulseUs: null },
    ]);
  });
});
