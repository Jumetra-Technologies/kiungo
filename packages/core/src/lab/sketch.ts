/**
 * The default sketch every board in the lab runs, written down as rules.
 *
 * There is no firmware execution in the lab (the Firmware page is separate),
 * so this is the "program" the boards follow. It is deliberately the kind of
 * sketch a beginner writes:
 *
 * - With no sensor wired: blink each output (period = 2 × delay).
 * - With an alert sensor wired (ultrasonic, PIR, gas, soil, light): compare
 *   its reading to the board's setting and switch the outputs on while the
 *   condition holds. A buzzer beeps rather than holding a tone.
 * - PIR + servo: a gate. Motion seen → open angle; no motion → resting angle.
 * - A display shows the readings of the sensors on the same board.
 *
 * Everything here is a pure function of the readings, the settings and the
 * clock, so a frame can be sampled again at any time.
 */

import { ALERT_SENSORS, defaultOf, inputOf, isSet } from "./controls";
import type { Reading } from "./simulate";
import type { LabNode, NodeInputs } from "./types";

export type Inputs = Record<string, NodeInputs> | undefined;

export interface BoardSettings {
  delayMs: number;
  warnCm: number;
  gateOpen: number;
  gateRest: number;
  gasPpm: number;
  dryPct: number;
  darkPct: number;
}

export function boardSettings(boardId: string | null, inputs: Inputs): BoardSettings {
  const n = (key: keyof BoardSettings) => inputOf(inputs, boardId ?? "", key, defaultOf("arduino-uno", key) as number);
  return { delayMs: n("delayMs"), warnCm: n("warnCm"), gateOpen: n("gateOpen"), gateRest: n("gateRest"), gasPpm: n("gasPpm"), dryPct: n("dryPct"), darkPct: n("darkPct") };
}

/** What a sensor measured this frame, as numbers the sketch can compare and lines a display can show. */
export interface SensorSample {
  node: LabNode;
  readings: Reading[];
  /** 0–1, how strongly the sensor is "on" (for the canvas). */
  level: number;
  on: boolean;
  badge?: string;
  /** Numeric values by name: distanceCm, motion (0/1), temperatureC, humidity, light, moisture, gasPpm, pitch, roll, pressureHpa. */
  values: Record<string, number>;
  /** "Set by you" rather than the simulated sweep. */
  held: boolean;
}

const fmt = (n: number, digits = 1) => n.toFixed(digits);
const square = (t: number, period: number, duty = 0.5, phase = 0) => (((t + phase) % period) + period) % period < period * duty ? 1 : 0;

/**
 * A sensor's reading at time t: the value the person set, or the lab's
 * simulated sweep. Alarm-type lines use the board's setting.
 */
export function sampleSensor(node: LabNode, t: number, inputs: Inputs, settings: BoardSettings): SensorSample {
  const held = isSet(inputs, node.id);
  const get = (key: string, fallback: number) => (held ? inputOf(inputs, node.id, key, fallback) : fallback);
  const sample = (values: Record<string, number>, readings: Reading[], extra: { level: number; on: boolean; badge?: string }): SensorSample => ({ node, readings, values, held, ...extra });

  switch (node.partId) {
    case "dht11":
    case "dht22":
    case "am2302": {
      const temperatureC = held ? get("temperatureC", 24) : 22 + 3 * Math.sin(t / 8);
      const humidity = held ? get("humidity", 55) : 55 + 8 * Math.cos(t / 12);
      return sample({ temperatureC, humidity }, [{ label: "Temperature", value: `${fmt(temperatureC)} °C` }, { label: "Humidity", value: `${fmt(humidity, 0)} %` }], { level: 0.5, on: true, badge: `${fmt(temperatureC)} °C` });
    }
    case "ds18b20": {
      const temperatureC = held ? get("temperatureC", 24.5) : 24.5 + 1.5 * Math.sin(t / 10);
      return sample({ temperatureC }, [{ label: "Temperature", value: `${fmt(temperatureC, 2)} °C` }], { level: 0.5, on: true, badge: `${fmt(temperatureC)} °C` });
    }
    case "hc-sr04": {
      const distanceCm = held ? get("distanceCm", 30) : 30 + 20 * Math.abs(Math.sin(t / 5));
      const warn = distanceCm < settings.warnCm;
      return sample({ distanceCm }, [{ label: "Distance", value: `${fmt(distanceCm)} cm` }, { label: "Obstacle", value: warn ? `Closer than ${settings.warnCm} cm` : "Clear" }], { level: square(t, 0.1, 0.3), on: true, badge: `${fmt(distanceCm, 0)} cm` });
    }
    case "pir": {
      const motion = held ? inputOf(inputs, node.id, "motion", false) : square(t, 8, 0.375) === 1;
      return sample({ motion: motion ? 1 : 0 }, [{ label: "Motion", value: motion ? "Detected" : "None" }], { level: motion ? 1 : 0, on: motion, badge: motion ? "Motion" : "Clear" });
    }
    case "ldr": {
      const light = held ? get("light", 60) : 50 + 40 * Math.sin(t / 4);
      return sample({ light }, [{ label: "Light", value: `${fmt(light, 0)} %` }, { label: "Level", value: light < settings.darkPct ? "Dark" : "Lit" }], { level: light / 100, on: true, badge: `${fmt(light, 0)} %` });
    }
    case "soil-moisture": {
      const moisture = held ? get("moisture", 45) : 60 - ((t * 0.8) % 40);
      return sample({ moisture }, [{ label: "Moisture", value: `${fmt(moisture, 0)} %` }, { label: "Threshold", value: moisture < settings.dryPct ? "Dry" : "Wet enough" }], { level: moisture / 100, on: true, badge: `${fmt(moisture, 0)} %` });
    }
    case "mq2": {
      const gasPpm = held ? get("gasPpm", 300) : 300 + 250 * Math.max(0, Math.sin(t / 6)) ** 3;
      return sample({ gasPpm }, [{ label: "Gas", value: `${fmt(gasPpm, 0)} ppm` }, { label: "Alarm", value: gasPpm > settings.gasPpm ? "Over threshold" : "Normal" }], { level: Math.min(1, gasPpm / 600), on: true, badge: `${fmt(gasPpm, 0)} ppm` });
    }
    case "mpu6050": {
      const pitch = held ? get("pitch", 0) : 25 * Math.sin(t / 2);
      const roll = held ? get("roll", 0) : 15 * Math.cos(t / 3);
      return sample({ pitch, roll }, [{ label: "Pitch", value: `${fmt(pitch)}°` }, { label: "Roll", value: `${fmt(roll)}°` }, { label: "Accel Z", value: `${fmt(Math.cos((pitch * Math.PI) / 180), 2)} g` }], { level: 0.5, on: true, badge: `${fmt(pitch, 0)}° tilt` });
    }
    case "bmp280": {
      const pressureHpa = held ? get("pressureHpa", 1013.2) : 1013.2 + 1.5 * Math.sin(t / 20);
      const temperatureC = held ? get("temperatureC", 23.1) : 23.1 + 0.4 * Math.sin(t / 9);
      return sample({ pressureHpa, temperatureC }, [{ label: "Pressure", value: `${fmt(pressureHpa)} hPa` }, { label: "Temperature", value: `${fmt(temperatureC)} °C` }, { label: "Altitude", value: `${fmt(44330 * (1 - (pressureHpa / 1013.25) ** 0.1903), 1)} m` }], { level: 0.5, on: true, badge: `${fmt(pressureHpa, 0)} hPa` });
    }
    default:
      return sample({}, [], { level: 0, on: false });
  }
}

/** Whether a sensor's condition holds, by the board's settings. Null for sensors the sketch doesn't compare. */
export function alertOf(sample: SensorSample, settings: BoardSettings): boolean | null {
  const v = sample.values;
  switch (sample.node.partId) {
    case "hc-sr04":
      return v.distanceCm < settings.warnCm;
    case "pir":
      return v.motion === 1;
    case "mq2":
      return v.gasPpm > settings.gasPpm;
    case "soil-moisture":
      return v.moisture < settings.dryPct;
    case "ldr":
      return v.light < settings.darkPct;
    default:
      return null;
  }
}

/** The sketch's view of one board: its sensors, settings and what they imply for its outputs. */
export interface BoardPlan {
  settings: BoardSettings;
  samples: SensorSample[];
  /** The alert sensor the outputs follow, if there is one. */
  alertSensor: SensorSample | null;
  alert: boolean;
  /** A PIR on the board: the gate policy applies to its servos. */
  motion: boolean | null;
}

export function planBoard(boardId: string | null, samples: SensorSample[], inputs: Inputs): BoardPlan {
  const settings = boardSettings(boardId, inputs);
  const alertSensor = samples.find((s) => ALERT_SENSORS.has(s.node.partId)) ?? null;
  const alert = alertSensor ? alertOf(alertSensor, settings) === true : false;
  const pir = samples.find((s) => s.node.partId === "pir");
  return { settings, samples, alertSensor, alert, motion: pir ? pir.values.motion === 1 : null };
}

/** Character cells of each display. */
const SCREENS: Record<string, { cols: number; rows: number }> = {
  "lcd-16x2": { cols: 16, rows: 2 },
  "oled-ssd1306": { cols: 21, rows: 4 },
  "tft-display": { cols: 20, rows: 5 },
};

const SHORT_LABEL: Record<string, string> = { Temperature: "Temp", Humidity: "Hum", Distance: "Dist", Moisture: "Soil", Pressure: "Press", Altitude: "Alt", "Accel Z": "Az", Obstacle: "Obj", Threshold: "Soil", Alarm: "Gas", Level: "Light" };

/**
 * What a display on the board shows: the readings of the board's sensors,
 * one per line, the first reading of each sensor before second readings,
 * cut to the display's width. With no sensor: a banner and the uptime. With
 * a sensor wired that can't be read: "<sensor>: no data".
 */
export function displayLines(partId: string, samples: SensorSample[], t: number, silent: readonly string[] = []): string[] {
  const screen = SCREENS[partId] ?? { cols: 16, rows: 2 };
  // A sensor that is on the board but gives no reading: the sketch's read fails, and says so, rather
  // than showing a made-up value or the no-sensor banner.
  if (!samples.length && silent.length) return [`${silent[0]}: no data`, "Check its wiring"].map((l) => l.slice(0, screen.cols));
  if (!samples.length) return [`Hello, Kiungo!`, `Up ${fmt(t, 0)} s`].map((l) => l.slice(0, screen.cols));
  const lines: string[] = [];
  const depth = Math.max(...samples.map((s) => s.readings.length));
  for (let i = 0; i < depth && lines.length < screen.rows; i++) {
    for (const s of samples) {
      const r = s.readings[i];
      if (!r || lines.length >= screen.rows) continue;
      // Alarm/threshold lines repeat what the outputs already show; prefer measurements.
      if (["Obstacle", "Threshold", "Alarm", "Level"].includes(r.label) && depth > 1 && samples.length * depth > screen.rows) continue;
      lines.push(`${SHORT_LABEL[r.label] ?? r.label}: ${r.value}`.slice(0, screen.cols));
    }
  }
  return lines;
}
