// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../src/lab/circuit";
import { arduinoPinOf, peripheralInputs, programFrame } from "../src/lab/program";
import { frameAt } from "../src/lab/simulate";
import { buildStarter } from "../src/project";
import { boardIsReal, hybridBindings, hybridValues, outReadings, packDht, parsePlan } from "../src/hybrid/plan";
import { generateShim } from "../src/hybrid/shim";
import { decodeFrame, Frame } from "../src/hybrid/protocol";
import { ECHO_US_PER_CM } from "../src/emulator/peripherals";

function setup(starter: string, mode: "virtual" | "physical" = "virtual") {
  const { session } = buildStarter({ name: "x", board: "arduino-uno", starter });
  const nodes = session.nodes.map((n, i) => (i === 0 ? { ...n, mode: "physical" as const } : { ...n, mode }));
  const analysis = analyze(nodes, session.wires, session.inputs);
  return { session: { ...session, nodes }, nodes, analysis, board: nodes[0] };
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
    const links = analysis.nodes[sensor.id].links;
    const trig = arduinoPinOf(links.find((l) => l.pin === "TRIG")!.boardPin)!;
    const echo = arduinoPinOf(links.find((l) => l.pin === "ECHO")!.boardPin)!;
    const b = hybridBindings(nodes, analysis, board.id, "arduino:avr:nano:cpu=atmega328");
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
    expect(hybridValues(b, [{ id: sensor.id, kind: "hc-sr04", trig, echo, distanceCm: 900 }])).toEqual([
      [0, 0],
      [1, 38_000],
    ]);
  });

  it("the same HC-SR04 marked Physical is the real one: nothing is played", () => {
    const { nodes, analysis, board } = setup("distance", "physical");
    const b = hybridBindings(nodes, analysis, board.id);
    expect(b.sensors).toEqual([]);
    expect(b.physical.map((n) => n.partId)).toContain("hc-sr04");
  });

  it("a virtual DHT11 is played through the DHT adapter, in tenths", () => {
    const { nodes, analysis, board, session } = setup("dht11");
    const b = hybridBindings(nodes, analysis, board.id);
    expect(b.plan.sensors).toMatchObject([{ part: "dht11", adapter: "DHT" }]);
    const { inputs } = peripheralInputs(nodes, analysis, session.inputs, board.id, 0);
    const [[, value]] = hybridValues(b, inputs);
    const dht = inputs.find((i) => i.kind === "dht")!;
    expect(dht.kind === "dht" && value).toBe(packDht(dht.temperatureC, dht.humidity));
    expect(packDht(23.4, 55)).toBe((234 << 16) | 550);
    expect(packDht(-5, 40) >> 16).toBe(-50);
  });

  it("outputs stay real: an LED is on the desk, not played", () => {
    const { nodes, analysis, board } = setup("blink");
    const b = hybridBindings(nodes, analysis, board.id);
    expect(b.sensors).toEqual([]);
    expect(b.physical.map((n) => n.partId)).toContain("led");
  });
});

describe("a plan from the interface is checked before it reaches the header", () => {
  it("passes a plain plan and sets the board", () => {
    const r = parsePlan({ board: "anything", sensors: [{ id: 0, part: "hc-sr04", pins: [9], adapter: "NewPing" }] }, "arduino:avr:uno");
    expect(r).toEqual({ ok: true, plan: { board: "arduino:avr:uno", sensors: [{ id: 0, part: "hc-sr04", pins: [9], adapter: "NewPing" }] } });
  });

  it("refuses part ids that would break out of the header's comment", () => {
    expect(parsePlan({ sensors: [{ id: 0, part: "ldr\n#define Serial x", pins: [14] }] }, "arduino:avr:uno").ok).toBe(false);
    expect(parsePlan({ sensors: [{ id: 0, part: "ldr", pins: [14], adapter: "../../etc" }] }, "arduino:avr:uno").ok).toBe(false);
  });

  it("refuses pins the board doesn't have, shared pins and too many sensors", () => {
    expect(parsePlan({ sensors: [{ id: 0, part: "ldr", pins: [40] }] }, "arduino:avr:uno")).toMatchObject({ ok: false, message: "Pin 40 doesn't exist on this board." });
    expect(parsePlan({ sensors: [{ id: 0, part: "ldr", pins: [14] }, { id: 1, part: "pir", pins: [14] }] }, "arduino:avr:uno").ok).toBe(false);
    expect(parsePlan({ sensors: Array.from({ length: 9 }, (_, i) => ({ id: i, part: "pir", pins: [i] })) }, "arduino:avr:uno").ok).toBe(false);
    expect(parsePlan(null, "arduino:avr:uno").ok).toBe(false);
  });
});

describe("what the real board drove, in the lab (OUT-01)", () => {
  it("decodes OUT frames: levels, the written pins and PWM", () => {
    // levels: pin 13 high; driven: pins 5 and 13; then pin 5 at PWM 128.
    const frame = decodeFrame(new Uint8Array([Frame.Out, 0, 0x20, 0, 0, 1 << 5, 0x20, 0, 0, 5, 128]));
    expect(frame).toEqual({ type: "out", levels: 1 << 13, driven: (1 << 13) | (1 << 5), pwm: [[5, 128]] });
  });

  it("written pins become readings; pins never written are left to the lab", () => {
    const r = outReadings({ levels: 1 << 13, driven: (1 << 13) | (1 << 5) | (1 << 7), pwm: [[5, 128]] });
    expect(r).toEqual([
      { pin: 5, level: "high", duty: 128 / 255, hz: 0, pulseUs: null },
      { pin: 7, level: "low", duty: 0, hz: 0, pulseUs: null },
      { pin: 13, level: "high", duty: 1, hz: 0, pulseUs: null },
    ]);
  });

  it("the board says it runs on the real board, and the LED mirrors pin 13", () => {
    const { session, nodes, analysis, board } = setup("blink");
    const base = frameAt(nodes, session.wires, analysis, 1, true, session.inputs);
    const frame = programFrame(base, nodes, session.wires, analysis, { boardId: board.id, t: 2, speedPercent: 100, crashed: null, pins: outReadings({ levels: 1 << 13, driven: 1 << 13, pwm: [] }), where: "Arduino Uno on COM3" });
    expect(frame.nodes[board.id]).toMatchObject({ badge: "On board" });
    expect(frame.nodes[board.id].readings).toContainEqual({ label: "Runs on", value: "The real Arduino Uno on COM3" });
    expect(frame.nodes[nodes[1].id]).toMatchObject({ on: true, badge: "ON" });
  });
});
