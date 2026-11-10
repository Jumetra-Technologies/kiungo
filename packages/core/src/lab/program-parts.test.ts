import { describe, expect, it } from "vitest";
import type { PinReading } from "../emulator/protocol";
import {
  PROGRAM_OUTPUTS,
  driven,
  isProgramSensor,
  notModeledLive,
  servoAngle,
  type ProgramPart,
} from "./program-parts";
import type { LabNode } from "./types";

const reading = (r: Partial<PinReading>): PinReading => ({
  pin: 9,
  level: "high",
  duty: 1,
  hz: 0,
  pulseUs: null,
  ...r,
});

/** A part on the program's board whose pins read as given. */
function part(
  partId: string,
  pins: Record<string, PinReading | undefined>,
  previous?: { angle: number },
) {
  const mirrored: Record<string, number> = {};
  const p: ProgramPart = {
    node: { id: partId, partId, label: partId, x: 0, y: 0, mode: "virtual" } as LabNode,
    report: {} as ProgramPart["report"],
    previous: previous ? { on: true, level: 0, readings: [], ...previous } : undefined,
    t: 2,
    link: (pin) =>
      pin in pins ? { board: "uno", boardPin: `D${pin}`, pin, role: "drive" } : undefined,
    at: (pin) => pins[pin],
    // As on the board: only pins the part is wired by.
    mirror: (pin, v) => {
      if (pin in pins) mirrored[pin] = v;
    },
  };
  return { live: PROGRAM_OUTPUTS.get(partId)!(p), mirrored };
}

describe("parts showing what the program does to their pins", () => {
  it("a pin's duty while the program drives it, nothing while it reads", () => {
    expect(driven(reading({ level: "high", duty: 0.4 }))).toBe(0.4);
    expect(driven(reading({ level: "input", duty: 0.4 }))).toBe(0);
    expect(driven(undefined)).toBe(0);
  });

  it("an LED as bright as its pin's PWM duty", () => {
    expect(part("led", { A: reading({ duty: 1 }) }).live).toMatchObject({
      on: true,
      badge: "ON",
      readings: [{ value: "On" }],
    });
    expect(part("led", { A: reading({ duty: 0.5 }) }).live.readings[0]!.value).toBe(
      "On, 50 % (PWM)",
    );
    expect(part("led", {}).live).toMatchObject({ on: false, level: 0, badge: "OFF" });
  });

  it("a servo at the angle its pulse means, holding its last one between pulses", () => {
    expect(servoAngle(544)).toBe(0);
    expect(servoAngle(2400)).toBe(180);
    expect(servoAngle(1472)).toBeCloseTo(90, 6);
    expect(servoAngle(3000)).toBe(180);
    expect(
      part("servo", { SIG: reading({ hz: 50, pulseUs: 1472, duty: 0.07 }) }).live.angle,
    ).toBeCloseTo(90, 6);
    expect(part("servo", { SIG: undefined }, { angle: 33 }).live).toMatchObject({
      angle: 33,
      on: false,
      readings: [{}, { value: "No signal" }],
    });
  });

  it("a buzzer at the pitch its pin toggles, or its own tone on a steady high", () => {
    expect(part("buzzer", { P: reading({ hz: 440, duty: 0.5 }) }).live.badge).toBe("440 Hz");
    expect(part("buzzer", { P: reading({ hz: 0, duty: 1 }) }).live.tone?.hz).toBe(2300);
    expect(part("buzzer", { P: reading({ level: "low", duty: 0 }) }).live.tone).toBeNull();
  });

  it("a relay module energised by a low pin; a motor driver by its IN pins", () => {
    expect(part("relay", { IN: reading({ level: "low", duty: 0 }) }).live.badge).toBe("Energised");
    const fwd = part("dc-motor", { IN1: reading({}), IN2: reading({ level: "low", duty: 0 }) });
    expect(fwd.live.readings).toEqual([
      { label: "Speed", value: "140 rpm" },
      { label: "Direction", value: "Forward" },
    ]);
    expect(fwd.mirrored).toEqual({ IN1: 1, IN2: 0 });
    expect(part("dc-motor", { IN1: reading({}), IN2: reading({}) }).live.badge).toBe("Stopped");
  });

  it("an RGB LED mixes its three pins", () => {
    const { live, mirrored } = part("rgb-led", {
      R: reading({ duty: 1 }),
      G: reading({ duty: 0.5 }),
      B: reading({ level: "input", duty: 1 }),
    });
    expect(live.rgb).toEqual([1, 0.5, 0]);
    expect(mirrored).toEqual({ R: 1, G: 0.5, B: 0 });
  });

  it("parts on buses the emulator doesn't model yet say so; sensors and boards aren't touched", () => {
    expect(notModeledLive("lcd-16x2")?.badge).toBe("—");
    expect(notModeledLive("dht11")).toBeNull();
    expect(notModeledLive("arduino-uno")).toBeNull();
    expect(notModeledLive("breadboard")).toBeNull();
    expect(isProgramSensor("hc-sr04")).toBe(true);
    expect(isProgramSensor("mpu6050")).toBe(false);
  });
});
