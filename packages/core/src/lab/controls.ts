/**
 * The knobs a part has in the lab, declared once so the Inspector can draw
 * them, the simulation can read them and tests can set them.
 *
 * Three kinds of part have inputs:
 * - sensors: their surroundings. "Simulated sweep" keeps the lab's own
 *   time-varying demo signal; "Set by you" holds the value you give.
 * - actuators without a sensor driving them: a command (servo angle, motor
 *   speed and direction, stepper moves).
 * - boards: the sketch's settings (blink delay, warning distance, gate
 *   angles). Only the settings that apply to what is wired to the board
 *   are shown.
 */

import type { Analysis } from "./circuit";
import { getPinout } from "./pinout";
import type { LabNode, NodeInputs } from "./types";
import { DEFAULT_OHMS, RESISTOR_VALUES, formatOhms } from "../parts/models/passives";

export type Control =
  | { key: string; kind: "number"; label: string; min: number; max: number; step: number; unit?: string; default: number; help?: string }
  | { key: string; kind: "toggle"; label: string; on: string; off: string; default: boolean; help?: string }
  | { key: string; kind: "select"; label: string; options: Array<{ id: string; label: string }>; default: string; help?: string };

/** The "where does the value come from" switch every sensor and free actuator has. */
export const SOURCE_KEY = "source";
export const SOURCE_AUTO = "auto";
export const SOURCE_SET = "set";

const source = (autoLabel: string, setLabel = "Set by you"): Control => ({
  key: SOURCE_KEY,
  kind: "select",
  label: "Input",
  options: [
    { id: SOURCE_AUTO, label: autoLabel },
    { id: SOURCE_SET, label: setLabel },
  ],
  default: SOURCE_AUTO,
});

const num = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string, help?: string): Control => ({ key, kind: "number", label, min, max, step, default: def, unit, help });

/** Sensor surroundings. The ranges are the parts' documented measuring ranges. */
const SENSOR_CONTROLS: Record<string, Control[]> = {
  "hc-sr04": [source("Simulated sweep (30–50 cm)", "Obstacle set by you"), num("distanceCm", "Obstacle distance", 2, 400, 1, 30, "cm", "HC-SR04 range: 2–400 cm")],
  pir: [source("Simulated (motion every 8 s)", "Set by you"), { key: "motion", kind: "toggle", label: "Motion", on: "Detected", off: "None", default: false }],
  dht11: [source("Simulated sweep"), num("temperatureC", "Temperature", 0, 50, 0.1, 24, "°C", "DHT11 range: 0–50 °C"), num("humidity", "Humidity", 20, 90, 1, 55, "%", "DHT11 range: 20–90 %")],
  dht22: [source("Simulated sweep"), num("temperatureC", "Temperature", -40, 80, 0.1, 24, "°C"), num("humidity", "Humidity", 0, 100, 1, 55, "%")],
  am2302: [source("Simulated sweep"), num("temperatureC", "Temperature", -40, 80, 0.1, 24, "°C"), num("humidity", "Humidity", 0, 100, 1, 55, "%")],
  ds18b20: [source("Simulated sweep"), num("temperatureC", "Temperature", -55, 125, 0.1, 24.5, "°C")],
  ldr: [source("Simulated sweep"), num("light", "Light", 0, 100, 1, 60, "%")],
  "soil-moisture": [source("Simulated (drying out)"), num("moisture", "Soil moisture", 0, 100, 1, 45, "%")],
  mq2: [source("Simulated sweep"), num("gasPpm", "Gas", 0, 10000, 10, 300, "ppm")],
  mpu6050: [source("Simulated (rocking)"), num("pitch", "Pitch", -90, 90, 1, 0, "°"), num("roll", "Roll", -90, 90, 1, 0, "°")],
  bmp280: [source("Simulated sweep"), num("pressureHpa", "Pressure", 300, 1100, 0.1, 1013.2, "hPa"), num("temperatureC", "Temperature", -40, 85, 0.1, 23.1, "°C")],
};

/** Commands for actuators that no sensor on the board is driving. */
const ACTUATOR_CONTROLS: Record<string, Control[]> = {
  servo: [source("Simulated sweep (15–165°)", "Angle set by you"), num("angle", "Angle", 0, 180, 1, 90, "°", "SG90 travel: 0–180°")],
  "dc-motor": [
    source("Simulated (speed and direction vary)", "Command set by you"),
    num("speed", "Speed (PWM)", 0, 100, 1, 0, "%", "Duty on EN. 100 % ≈ 140 rpm with no load; 0 stops the motor."),
    { key: "direction", kind: "select", label: "Direction", options: [{ id: "forward", label: "Forward (IN1 high)" }, { id: "reverse", label: "Reverse (IN2 high)" }], default: "forward" },
  ],
  "stepper-motor": [
    source("Simulated (turns continuously)", "Steps commanded by you"),
    num("stepsPerSecond", "Speed", 1, 1000, 1, 256, "steps/s", "28BYJ-48 with ULN2003: 2048 steps per turn of the output shaft."),
  ],
};

/** Values of passive parts. */
const PASSIVE_CONTROLS: Record<string, Control[]> = {
  resistor: [
    {
      key: "ohms",
      kind: "select",
      label: "Value",
      options: RESISTOR_VALUES.map((v) => ({ id: String(v), label: `${formatOhms(v)}${v === 220 ? " (red red brown)" : v === 1000 ? " (brown black red)" : v === 10000 ? " (brown black orange)" : ""}` })),
      default: String(DEFAULT_OHMS),
      help: "The bands on the part change with it. 220 Ω suits an LED on a 5 V pin.",
    },
  ],
};

/** A resistor's value in ohms, as set in the lab (220 Ω if not). */
export function ohmsOf(inputs: Record<string, NodeInputs> | undefined, nodeId: string): number {
  const v = Number(inputs?.[nodeId]?.ohms);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_OHMS;
}

/** Sketch settings on a board. `when` says which wired parts make a setting relevant. */
const BOARD_CONTROLS: Array<Control & { when: (partsOnBoard: Set<string>) => boolean }> = [
  { ...num("delayMs", "Blink delay", 50, 5000, 50, 500, "ms", "delay() between switching an output on and off, as in the Arduino Blink sketch. Period = 2 × delay."), when: () => true },
  { ...num("warnCm", "Warning distance", 2, 400, 1, 20, "cm", "Outputs on this board turn on while the ultrasonic distance is below this."), when: (p) => p.has("hc-sr04") },
  { ...num("gateOpen", "Gate open angle", 0, 180, 1, 90, "°", "Servo angle while motion is seen."), when: (p) => p.has("pir") && p.has("servo") },
  { ...num("gateRest", "Gate resting angle", 0, 180, 1, 0, "°", "Servo angle while no motion is seen."), when: (p) => p.has("pir") && p.has("servo") },
  { ...num("gasPpm", "Gas alarm level", 0, 10000, 10, 450, "ppm", "Outputs turn on above this."), when: (p) => p.has("mq2") },
  { ...num("dryPct", "Dry below", 0, 100, 1, 30, "%", "Outputs (a pump relay, say) turn on below this moisture."), when: (p) => p.has("soil-moisture") },
  { ...num("darkPct", "Dark below", 0, 100, 1, 30, "%", "Outputs (a night light) turn on below this light level."), when: (p) => p.has("ldr") },
];

function stripWhen(control: Control & { when: unknown }): Control {
  const copy: Control & { when?: unknown } = { ...control };
  delete copy.when;
  return copy;
}

/** Outputs the sketch switches: they follow an alert sensor on their board, or blink. */
const FOLLOWERS = new Set(["led", "buzzer", "relay"]);

/** Alert sensors: the ones whose reading the sketch compares to a setting. */
export const ALERT_SENSORS = new Set(["hc-sr04", "pir", "mq2", "soil-moisture", "ldr"]);

export function isSensorPart(partId: string): boolean {
  return partId in SENSOR_CONTROLS;
}

/** Part ids of the peripherals wired to a board, by the analysis. */
export function partsOnBoard(boardId: string, nodes: LabNode[], analysis: Analysis): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (analysis.nodes[node.id]?.links.some((l) => l.board === boardId)) ids.add(node.partId);
  }
  return ids;
}

/** Board id a peripheral is wired to (its first signal link's board), if any. */
export function boardOf(nodeId: string, analysis: Analysis): string | null {
  const links = analysis.nodes[nodeId]?.links ?? [];
  return links.find((l) => !["vcc", "gnd"].includes(l.role))?.board ?? links[0]?.board ?? null;
}

/**
 * The controls to show for a node. Actuators driven by a sensor on their
 * board (a servo gate with a PIR, an LED with an ultrasonic) have no command
 * of their own: the sketch decides, so the Inspector says so instead.
 */
export function controlsFor(node: LabNode, nodes: LabNode[], analysis: Analysis): { title: string; controls: Control[]; note?: string } {
  const pinout = getPinout(node.partId);
  if (pinout.controller) {
    const parts = partsOnBoard(node.id, nodes, analysis);
    return { title: "Sketch settings", controls: BOARD_CONTROLS.filter((c) => c.when(parts)).map((c) => stripWhen(c)) };
  }
  if (PASSIVE_CONTROLS[node.partId]) return { title: "Value", controls: PASSIVE_CONTROLS[node.partId] };
  if (SENSOR_CONTROLS[node.partId]) return { title: "Surroundings", controls: SENSOR_CONTROLS[node.partId] };
  if (FOLLOWERS.has(node.partId)) {
    const board = boardOf(node.id, analysis);
    const driver = board ? drivingSensor(node.partId, partsOnBoard(board, nodes, analysis)) : null;
    if (driver) return { title: "Command", controls: [], note: `Driven by the sketch from the ${driver} on this board: on while its condition holds. Change the ${driver}'s input or the board's settings.` };
    return { title: "Command", controls: [], note: board ? "Blinks with the board's delay. Select the board to change it, or wire a sensor to the board for the sketch to follow." : "" };
  }
  if (ACTUATOR_CONTROLS[node.partId]) {
    const board = boardOf(node.id, analysis);
    const driver = board ? drivingSensor(node.partId, partsOnBoard(board, nodes, analysis)) : null;
    if (driver) return { title: "Command", controls: [], note: `Driven by the sketch from the ${driver} on this board. Change the ${driver}'s input or the board's sketch settings.` };
    return { title: "Command", controls: ACTUATOR_CONTROLS[node.partId] };
  }
  return { title: "Inputs", controls: [] };
}

/** Which sensor on the board, if any, the sketch uses to drive this kind of actuator. */
export function drivingSensor(partId: string, parts: Set<string>): string | null {
  if (partId === "servo") return parts.has("pir") ? "PIR sensor" : null;
  if (partId === "led" || partId === "buzzer" || partId === "relay") {
    for (const s of ["hc-sr04", "pir", "mq2", "soil-moisture", "ldr"]) if (parts.has(s)) return SENSOR_NAMES[s];
  }
  return null;
}

const SENSOR_NAMES: Record<string, string> = { "hc-sr04": "ultrasonic sensor", pir: "PIR sensor", mq2: "gas sensor", "soil-moisture": "soil moisture sensor", ldr: "light sensor" };

/** Read an input with its declared default. */
export function inputOf<T extends number | string | boolean>(inputs: Record<string, NodeInputs> | undefined, nodeId: string, key: string, fallback: T): T extends number ? number : T extends string ? string : boolean {
  const v = inputs?.[nodeId]?.[key];
  return (typeof v === typeof fallback ? v : fallback) as T extends number ? number : T extends string ? string : boolean;
}

/** Whether the person has taken the value over from the simulated sweep. */
export function isSet(inputs: Record<string, NodeInputs> | undefined, nodeId: string): boolean {
  return inputOf(inputs, nodeId, SOURCE_KEY, SOURCE_AUTO) === SOURCE_SET;
}

/** Clamp a number input to its declared range and step; strings and booleans pass through. */
export function coerceInput(control: Control, value: unknown): number | string | boolean | null {
  if (control.kind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    const clamped = Math.min(control.max, Math.max(control.min, n));
    const stepped = Math.round(clamped / control.step) * control.step;
    return Number(stepped.toFixed(4));
  }
  if (control.kind === "toggle") return Boolean(value);
  return control.options.some((o) => o.id === value) ? String(value) : null;
}

/** Find a control by part and key, boards included (for coercion in the store and tests). */
export function findControl(partId: string, key: string): Control | undefined {
  const pinout = getPinout(partId);
  const list = pinout.controller ? BOARD_CONTROLS : (SENSOR_CONTROLS[partId] ?? ACTUATOR_CONTROLS[partId] ?? PASSIVE_CONTROLS[partId] ?? []);
  return list.find((c) => c.key === key);
}

/** Default for a key, as declared. */
export function defaultOf(partId: string, key: string): number | string | boolean | undefined {
  return findControl(partId, key)?.default;
}
