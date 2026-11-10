import type { PinReading } from "../emulator/protocol";
import type { Analysis, BoardLink } from "./circuit";
import { getPinout } from "./pinout";
import { ACTIVE_BUZZER_HZ, type NodeLive } from "./simulate";
import type { LabNode } from "./types";

/** Below this a toggling pin is a blink, not a sound. */
const AUDIBLE_HZ = 20;
/** The Servo library's pulse range: 544 µs is 0°, 2400 µs is 180°. */
const SERVO_MIN_US = 544;
const SERVO_MAX_US = 2400;

export function servoAngle(pulseUs: number): number {
  return Math.max(
    0,
    Math.min(180, ((pulseUs - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US)) * 180),
  );
}

export const fmt = (n: number, digits = 0) => n.toFixed(digits);

/** A part on the program's board, with what the emulator says about its pins. */
export interface ProgramPart {
  node: LabNode;
  report: Analysis["nodes"][string];
  /** The part's previous frame, for what holds between pulses (a servo's angle). */
  previous: NodeLive | undefined;
  t: number;
  link: (pin: string) => BoardLink | undefined;
  /** The emulator's reading of the board pin a part pin is wired to. */
  at: (pin: string) => PinReading | undefined;
  /** Write a level to the part pin and the board pin it's wired to. */
  mirror: (pin: string, v: number) => void;
}

/** A pin's duty while the program drives it high or low; 0 while it's an input. */
export const driven = (r: PinReading | undefined) =>
  r && (r.level === "high" || r.level === "low") ? r.duty : 0;

function ledState(level: number): string {
  if (level > 0.98) return "On";
  return level > 0.02 ? `On, ${Math.round(level * 100)} % (PWM)` : "Off";
}

function ledLive(p: ProgramPart): NodeLive {
  const level = driven(p.at("A"));
  p.mirror("A", level);
  return {
    on: level > 0.02,
    level,
    readings: [{ label: "State", value: ledState(level) }],
    badge: level > 0.02 ? "ON" : "OFF",
  };
}

function rgbLive(p: ProgramPart): NodeLive {
  const rgb: [number, number, number] = [driven(p.at("R")), driven(p.at("G")), driven(p.at("B"))];
  p.mirror("R", rgb[0]);
  p.mirror("G", rgb[1]);
  p.mirror("B", rgb[2]);
  const level = Math.max(...rgb);
  return {
    on: level > 0.02,
    level,
    rgb,
    readings: [
      {
        label: "Color",
        value: `R ${Math.round(rgb[0] * 255)} G ${Math.round(rgb[1] * 255)} B ${Math.round(rgb[2] * 255)}`,
      },
    ],
    badge: level > 0.02 ? "On" : "Off",
  };
}

function buzzerLive(p: ProgramPart): NodeLive {
  const r = p.at("P");
  const duty = driven(r);
  const toggling = (r?.hz ?? 0) >= AUDIBLE_HZ;
  // A steady high drives the active buzzer's own oscillator; a toggling pin (tone()) sets the pitch.
  const hz = toggling ? (r?.hz ?? 0) : duty > 0.98 ? ACTIVE_BUZZER_HZ : 0;
  p.mirror("P", duty);
  return {
    on: hz > 0,
    level: hz > 0 ? 1 : 0,
    readings: [{ label: "Tone", value: hz ? `${Math.round(hz)} Hz` : "Silent" }],
    badge: hz ? `${Math.round(hz)} Hz` : "Quiet",
    tone: hz ? { hz, pattern: { period: 1, duty: 1, phase: 0 } } : null,
  };
}

function relayLive(p: ProgramPart): NodeLive {
  // The module's input is active-low: a low pin energises the coil.
  const r = p.at("IN");
  const energised = r?.level === "low";
  p.mirror("IN", r?.level === "high" ? 1 : 0);
  return {
    on: energised,
    level: energised ? 1 : 0,
    readings: [{ label: "Contact", value: energised ? "COM–NO closed" : "COM–NC closed" }],
    badge: energised ? "Energised" : "Released",
  };
}

function servoLive(p: ProgramPart): NodeLive {
  const r = p.at("SIG");
  const pulse = r && r.hz > 30 && r.hz < 400 ? r.pulseUs : null;
  const prev = p.previous?.angle ?? 90;
  const angle = pulse ? servoAngle(pulse) : prev;
  p.mirror("SIG", driven(r));
  return {
    on: pulse !== null,
    level: angle / 180,
    angle,
    readings: [
      { label: "Angle", value: `${Math.round(angle)}°` },
      {
        label: "Pulse",
        value: pulse
          ? `${Math.round(pulse)} µs every ${fmt(1000 / (r?.hz ?? 50), 1)} ms`
          : "No signal",
      },
    ],
    badge: `${Math.round(angle)}°`,
  };
}

function dcMotorLive(p: ProgramPart): NodeLive {
  const en = p.link("EN") ? driven(p.at("EN")) : 1;
  const in1 = p.at("IN1")?.level === "high";
  const in2 = p.at("IN2")?.level === "high";
  const duty = in1 !== in2 ? en : 0;
  const forward = in1 && !in2;
  for (const pin of ["EN", "IN1", "IN2"]) p.mirror(pin, driven(p.at(pin)));
  const rpm = Math.round(duty * 140);
  return {
    on: duty > 0,
    level: duty,
    angle: ((((forward ? 1 : -1) * p.t * rpm * 6) % 360) + 360) % 360,
    readings: [
      { label: "Speed", value: `${rpm} rpm` },
      { label: "Direction", value: rpm ? (forward ? "Forward" : "Reverse") : "Stopped" },
    ],
    badge: rpm ? `${rpm} rpm` : "Stopped",
  };
}

export const PROGRAM_OUTPUTS = new Map<string, (p: ProgramPart) => NodeLive>([
  ["led", ledLive],
  ["rgb-led", rgbLive],
  ["buzzer", buzzerLive],
  ["relay", relayLive],
  ["servo", servoLive],
  ["dc-motor", dcMotorLive],
]);

const PROGRAM_SENSORS = new Set([
  "hc-sr04",
  "dht11",
  "dht22",
  "am2302",
  "pir",
  "ldr",
  "soil-moisture",
  "mq2",
]);
export const isProgramSensor = (partId: string) => PROGRAM_SENSORS.has(partId);

/** Displays and radios talk over buses the emulator doesn't model yet: say so rather than show the built-in behavior. */
export function notModeledLive(partId: string): NodeLive | null {
  const pinout = getPinout(partId);
  if (pinout.controller || isProgramSensor(partId) || pinout.passive) return null;
  return {
    on: false,
    level: 0,
    readings: [
      {
        label: "Program",
        value: "Not shown yet: the lab doesn't model this part's bus for your code",
      },
    ],
    badge: "—",
  };
}
