// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "./circuit";
import {
  arduinoPinOf,
  peripheralInputs,
  programFrame,
  servoAngle,
  type ProgramReadings,
} from "./program";
import { frameAt } from "./simulate";
import { buildStarter } from "../project";
import type { PinReading } from "../emulator/pinstats";

const pin = (n: number, over: Partial<PinReading> = {}): PinReading => ({
  pin: n,
  level: "low",
  duty: 0,
  hz: 0,
  pulseUs: null,
  ...over,
});

function setup(starter: string) {
  const { session } = buildStarter({ name: "x", board: "arduino-uno", starter });
  const analysis = analyze(session.nodes, session.wires, session.inputs);
  const board = session.nodes[0];
  const base = frameAt({
    nodes: session.nodes,
    wires: session.wires,
    analysis,
    t: 1,
    running: true,
    inputs: session.inputs,
  });
  const frame = (pins: PinReading[], over: Partial<ProgramReadings> = {}) =>
    programFrame(base, session.nodes, session.wires, analysis, {
      boardId: board!.id,
      t: 1.5,
      speedPercent: 100,
      pins,
      crashed: null,
      ...over,
    });
  return { session, analysis, board, frame };
}

describe("the lab showing the user's program (RUN-02, DBG-01)", () => {
  it("names the Uno's pins as Arduino code does", () => {
    expect(arduinoPinOf("D13")).toBe(13);
    expect(arduinoPinOf("A0")).toBe(14);
    expect(arduinoPinOf("5V")).toBeNull();
  });

  it("an LED is as bright as its pin's duty", () => {
    const { session, frame } = setup("blink");
    const led = session.nodes[1];
    expect(frame([pin(13, { level: "high", duty: 1 })]).nodes[led!.id]).toMatchObject({
      on: true,
      level: 1,
      badge: "ON",
    });
    expect(frame([pin(13, { level: "low", duty: 0 })]).nodes[led!.id]).toMatchObject({
      on: false,
      badge: "OFF",
    });
    expect(frame([pin(13, { level: "high", duty: 0.4 })]).nodes[led!.id]!.readings[0]!.value).toBe(
      "On, 40 % (PWM)",
    );
  });

  it("the board says it runs your code, how fast, and when it crashed", () => {
    const { board, frame } = setup("blink");
    expect(frame([]).nodes[board!.id]).toMatchObject({ badge: "Running" });
    expect(
      frame([], { speedPercent: 64 }).nodes[board!.id]!.readings.find((r) => r.label === "Speed")
        ?.value,
    ).toBe("64 % of real time");
    expect(frame([], { crashed: "stack" }).nodes[board!.id]).toMatchObject({
      on: false,
      badge: "Crashed",
    });
  });

  it("a servo turns to the angle its pulse means", () => {
    const { session, analysis, frame } = setup("servo");
    const servo = session.nodes[1];
    const sig = analysis.nodes[servo!.id]!.links.find((l) => l.pin === "SIG")!;
    const n = arduinoPinOf(sig.boardPin)!;
    expect(
      frame([pin(n, { level: "low", duty: 0.07, hz: 50, pulseUs: 1472 })]).nodes[servo!.id]!.angle,
    ).toBeCloseTo(90, 0);
    expect(servoAngle(544)).toBe(0);
    expect(servoAngle(2400)).toBe(180);
  });

  it("a buzzer sounds at the pitch its pin toggles (tone()), and a steady high is the active buzzer's own tone", () => {
    const { session, analysis, frame } = setup("motion-alarm");
    const buzzer = session.nodes.find((n) => n.partId === "buzzer")!;
    const p = arduinoPinOf(analysis.nodes[buzzer.id]!.links.find((l) => l.pin === "P")!.boardPin)!;
    expect(frame([pin(p, { level: "high", duty: 0.5, hz: 440 })]).nodes[buzzer.id]!.tone?.hz).toBe(
      440,
    );
    expect(frame([pin(p, { level: "high", duty: 1 })]).nodes[buzzer.id]!.tone?.hz).toBe(2300);
    expect(frame([pin(p, { level: "low", duty: 0 })]).nodes[buzzer.id]!.tone).toBeNull();
  });

  it("the relay module energises on a low pin, as the real one does", () => {
    const { session, analysis, frame } = setup("relay");
    const relay = session.nodes[1];
    const p = arduinoPinOf(analysis.nodes[relay!.id]!.links.find((l) => l.pin === "IN")!.boardPin)!;
    expect(frame([pin(p, { level: "low" })]).nodes[relay!.id]!.badge).toBe("Energised");
    expect(frame([pin(p, { level: "high", duty: 1 })]).nodes[relay!.id]!.badge).toBe("Released");
  });
});

describe("the sensors answering the program (EMU-02, PCP-03)", () => {
  it("the distance starter's HC-SR04 on its wired pins, at the distance set", () => {
    const { session, analysis, board } = setup("distance");
    const sensor = session.nodes[1];
    const inputs = { [sensor!.id]: { source: "set", distanceCm: 42 } };
    expect(
      peripheralInputs({ nodes: session.nodes, analysis, inputs, boardId: board!.id, t: 0 }).inputs,
    ).toEqual([{ kind: "hc-sr04", id: sensor!.id, trig: 2, echo: 3, distanceCm: 42 }]);
  });

  it("a DHT11, a PIR and the night light's LDR", () => {
    const dht = setup("dht11");
    expect(
      peripheralInputs({
        nodes: dht.session.nodes,
        analysis: dht.analysis,
        inputs: { [dht.session.nodes[1]!.id]: { source: "set", temperatureC: 23.4, humidity: 55 } },
        boardId: dht.board!.id,
        t: 0,
      }).inputs,
    ).toEqual([
      {
        kind: "dht",
        id: dht.session.nodes[1]!.id,
        pin: 2,
        model: 11,
        temperatureC: 23.4,
        humidity: 55,
      },
    ]);
    const alarm = setup("motion-alarm");
    const pir = alarm.session.nodes.find((n) => n.partId === "pir")!;
    expect(
      peripheralInputs({
        nodes: alarm.session.nodes,
        analysis: alarm.analysis,
        inputs: { [pir.id]: { source: "set", motion: true } },
        boardId: alarm.board!.id,
        t: 0,
      }).inputs[0],
    ).toMatchObject({ kind: "digital", high: true });
    const night = setup("night-light");
    const ldr = night.session.nodes.find((n) => n.partId === "ldr")!;
    expect(
      peripheralInputs({
        nodes: night.session.nodes,
        analysis: night.analysis,
        inputs: { [ldr.id]: { source: "set", light: 20 } },
        boardId: night.board!.id,
        t: 0,
      }).inputs,
    ).toEqual([{ kind: "analog", id: ldr.id, pin: 14, volts: 1 }]);
  });

  it("without a set value, the lab's simulated sweep feeds the program", () => {
    const { session, analysis, board } = setup("distance");
    const a = peripheralInputs({
      nodes: session.nodes,
      analysis,
      inputs: undefined,
      boardId: board!.id,
      t: 0,
    }).inputs[0];
    const b = peripheralInputs({
      nodes: session.nodes,
      analysis,
      inputs: undefined,
      boardId: board!.id,
      t: 7,
    }).inputs[0];
    expect(a!.kind === "hc-sr04" && b!.kind === "hc-sr04" && a!.distanceCm !== b!.distanceCm).toBe(
      true,
    );
  });
});
