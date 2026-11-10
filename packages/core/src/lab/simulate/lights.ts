import { formatOhms } from "../../parts/models/passives";
import { ledCurrentMa } from "../circuit";
import {
  ACTIVE_BUZZER_HZ,
  boardLogicV,
  fmt,
  square,
  type NodeLive,
  type PartCtx,
  type PinPattern,
  type Reading,
} from "./live";

/** 1 or 0 while the board's alert sensor decides; `otherwise` when no sensor does. */
const followAlert = (c: PartCtx, otherwise: () => number) =>
  c.plan.alertSensor ? (c.plan.alert ? 1 : 0) : otherwise();

function ledLevel(c: PartCtx, onRail: boolean | undefined): number {
  const { go, running, ready, t, period, k } = c;
  if (go) return onRail ? 1 : followAlert(c, () => square(t, period, 0.5, k * (period / 4)));
  return !running && onRail && ready ? 1 : 0;
}

function ledWhy(c: PartCtx): string {
  const { plan, go } = c;
  if (plan.alertSensor)
    return plan.alert
      ? `On: ${plan.alertSensor.node.label} condition met`
      : `Off: waiting on ${plan.alertSensor.node.label}`;
  return go ? `Blinking, ${plan.settings.delayMs} ms` : "—";
}

function ledReadings(c: PartCtx, level: number, onRail: boolean | undefined): Reading[] {
  const { report, nodes, board } = c;
  // The lab has no resistor part: an LED on a pin is modeled with the 220 Ω a real build needs (see the circuit check's tip).
  const pinV = onRail ? (report?.supplyV ?? 5) : boardLogicV(nodes, board);
  // A wired resistor sets the current; with none, the model assumes 220 Ω (the circuit check's tip says so).
  const ohms = report?.seriesOhms || 220;
  const current = level > 0 ? ledCurrentMa(pinV, ohms) : 0;
  const measured = Boolean(report?.seriesOhms);
  return [
    { label: "Sketch", value: ledWhy(c) },
    {
      label: measured ? "Current" : "Current (modeled)",
      value: level
        ? `${fmt(current)} mA via ${formatOhms(ohms)}${measured ? "" : " (assumed)"}`
        : "0 mA",
    },
  ];
}

export function ledLive(c: PartCtx): NodeLive {
  const { report, go } = c;
  const onRail = !report?.links.some((l) => l.pin === "A") && report?.powered;
  const level = ledLevel(c, onRail);
  c.setLinks(() => level);
  return {
    on: level > 0,
    level,
    readings: [
      { label: "State", value: level ? "On" : "Off" },
      ...(go ? ledReadings(c, level, onRail) : []),
    ],
    badge: level ? "ON" : "OFF",
  };
}

function buzzerPattern(c: PartCtx): PinPattern | null {
  const { go, plan, period, k } = c;
  if (!go) return null;
  if (plan.alertSensor) return plan.alert ? { period: 0.3, duty: 0.5, phase: 0 } : null;
  return { period, duty: 0.15, phase: k * 0.2 };
}

export function buzzerLive(c: PartCtx): NodeLive {
  // The sketch beeps the pin: fast while an alert holds, a chirp per blink period otherwise.
  const pattern = buzzerPattern(c);
  const level = pattern ? square(c.t, pattern.period, pattern.duty, pattern.phase) : 0;
  c.setLinks(() => level);
  return {
    on: level > 0,
    level,
    readings: [{ label: "Tone", value: level ? "2.3 kHz beep" : pattern ? "Beeping" : "Silent" }],
    badge: level ? "BEEP" : pattern ? "Beeping" : "Quiet",
    tone: pattern ? { hz: ACTIVE_BUZZER_HZ, pattern } : null,
  };
}

export function relayLive(c: PartCtx): NodeLive {
  const { go, t, period, k } = c;
  const level = go ? followAlert(c, () => square(t, 4 * period, 0.5, k)) : 0;
  c.setLinks((role) => (role === "drive" ? 1 - level : 0));
  return {
    on: level > 0,
    level,
    readings: [{ label: "Contact", value: level ? "COM–NO closed" : "COM–NC closed" }],
    badge: level ? "Energised" : "Released",
  };
}

const CHANNEL = new Map([
  ["R", 0],
  ["G", 1],
  ["B", 2],
]);

export function rgbLive(c: PartCtx): NodeLive {
  const { go, t, report } = c;
  const r = go ? 0.5 + 0.5 * Math.sin(t * 1.3) : 0;
  const g = go ? 0.5 + 0.5 * Math.sin(t * 1.3 + 2.1) : 0;
  const b = go ? 0.5 + 0.5 * Math.sin(t * 1.3 + 4.2) : 0;
  const wired = (pin: string) => report?.links.some((l) => l.pin === pin) ?? false;
  const rgb: [number, number, number] = [
    wired("R") ? r : 0,
    wired("G") ? g : 0,
    wired("B") ? b : 0,
  ];
  c.setLinks((_, pin) => {
    const channel = CHANNEL.get(pin);
    return channel === undefined ? 0 : rgb[channel]!;
  });
  const level = Math.max(...rgb);
  return {
    on: level > 0.05,
    level,
    rgb,
    readings: [
      {
        label: "Color",
        value: `R ${Math.round(rgb[0] * 255)} G ${Math.round(rgb[1] * 255)} B ${Math.round(rgb[2] * 255)}`,
      },
    ],
    badge: go ? "Fading" : "Off",
  };
}
