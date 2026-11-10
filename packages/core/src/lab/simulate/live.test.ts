import { describe, expect, it } from "vitest";
import { circuit, part } from "../../../test/support/circuit";
import {
  ACTIVE_BUZZER_HZ,
  DC_MOTOR_MAX_RPM,
  STEPPER_STEPS_PER_TURN,
  boardFor,
  boardLogicV,
  fmt,
  isDisplay,
  isSensor,
  outputOrder,
  runnable,
  sensorReadings,
  square,
  stepperStepsAt,
} from "./live";

describe("the simulation's building blocks", () => {
  it("a square wave is high for its duty of each period, from its phase", () => {
    expect([0, 0.4, 0.5, 0.9, 1.0].map((t) => square(t, 1))).toEqual([1, 1, 0, 0, 1]);
    expect(square(0.2, 1, 0.25)).toBe(1);
    expect(square(0.3, 1, 0.25)).toBe(0);
    expect(square(0, 1, 0.5, 0.6)).toBe(0);
    expect(square(-0.2, 1)).toBe(0); // before zero, the same pattern
    expect(fmt(3.14159)).toBe("3.1");
    expect(fmt(3.14159, 0)).toBe("3");
  });

  it("the parts' constants are their datasheets'", () => {
    expect(ACTIVE_BUZZER_HZ).toBe(2300);
    expect(STEPPER_STEPS_PER_TURN).toBe(2048);
    expect(DC_MOTOR_MAX_RPM).toBe(140);
  });

  it("a board's logic level, 5 V when there's no board", () => {
    const nodes = [part("uno", "arduino-uno"), part("esp", "esp32")];
    expect(boardLogicV(nodes, "esp")).toBe(3.3);
    expect(boardLogicV(nodes, "uno")).toBe(5);
    expect(boardLogicV(nodes, null)).toBe(5);
  });

  it("orders each board's outputs so their blinks can be staggered", () => {
    const { nodes, analysis } = circuit(
      [part("uno", "arduino-uno"), part("a", "led"), part("b", "led"), part("d", "dht11")],
      ["uno.D13>a.A", "uno.D12>b.A", "uno.D2>d.DATA"],
    );
    expect(outputOrder(nodes, analysis)).toEqual(
      new Map([
        ["a", 0],
        ["b", 1],
      ]),
    );
  });

  it("a part runs when ready, or with only a signal-level fault; it takes its signal from one board", () => {
    const ready = {
      status: "ready" as const,
      powered: true,
      grounded: true,
      supplyV: 5,
      links: [],
      faults: [],
      wiredPins: new Set<string>(),
    };
    expect(runnable(ready)).toBe(true);
    expect(runnable(undefined)).toBe(false);
    const level = {
      id: "level-out:DATA:d",
      severity: "error" as const,
      title: "",
      detail: "",
      nodes: [],
      wires: [],
    };
    expect(runnable({ ...ready, status: "fault", faults: [level] })).toBe(true);
    expect(runnable({ ...ready, status: "fault", faults: [{ ...level, id: "no-power:d" }] })).toBe(
      false,
    );
    const links = [
      { board: "a", boardPin: "5V", pin: "VCC", role: "vcc" as const },
      { board: "b", boardPin: "D2", pin: "DATA", role: "io" as const },
    ];
    expect(boardFor({ ...ready, links })).toBe("b");
    expect(boardFor({ ...ready, links: links.slice(0, 1) })).toBe("a");
    expect(boardFor(undefined)).toBeNull();
  });

  it("a commanded stepper moves to its target at its speed, then holds", () => {
    const inputs = { s: { cmdFrom: 0, cmdTarget: 512, cmdAt: 1, stepsPerSecond: 256 } };
    expect(stepperStepsAt(inputs, "s", 0.5)).toBe(0);
    expect(stepperStepsAt(inputs, "s", 2)).toBe(256);
    expect(stepperStepsAt(inputs, "s", 10)).toBe(512);
    expect(stepperStepsAt({ s: { cmdFrom: 100, cmdTarget: -100 } }, "s", 10)).toBe(-100);
    expect(stepperStepsAt(undefined, "s", 10)).toBe(0);
  });

  it("knows its sensors and displays, and a sensor's sweep with nothing set", () => {
    expect(isSensor("hc-sr04")).toBe(true);
    expect(isSensor("led")).toBe(false);
    expect(isDisplay("lcd-16x2")).toBe(true);
    expect(isDisplay("led")).toBe(false);
    const r = sensorReadings("hc-sr04", 0);
    expect(r.readings[0]).toEqual({ label: "Distance", value: "30.0 cm" });
    expect(r.on).toBe(true);
  });
});
