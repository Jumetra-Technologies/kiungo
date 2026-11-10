/**
 * Virtual and physical bindings (RUN-01, RUN-04): which parts of a circuit
 * are on the desk and which Kiungo plays, and how a Hybrid build answers the
 * sketch for each virtual one.
 *
 * The board runs the user's sketch for real. A part marked Virtual in the
 * Inspector is played by Kiungo: its pins answer the sketch from values the
 * PC pushes over the link (the shim, INJ-01), with the lab's sweep or the
 * value set in the Inspector. Parts marked Physical are the real ones wired
 * on the desk, and outputs are always real: the board drives them, and
 * reports what it drove so the lab mirrors it (OUT-01, OUT-04).
 */

import type { PeripheralInput } from "../emulator/peripherals";
import type { PinReading } from "../emulator/pinstats";
import { ECHO_US_PER_CM, HC_SR04_RANGE_CM } from "../emulator/peripherals";
import type { Analysis } from "../lab/circuit";
import { arduinoPinOf } from "../lab/program";
import type { LabNode } from "../lab/types";
import { MAX_SENSORS } from "./protocol";
import { pinTable, type HybridPlan, type VirtualSensor } from "./shim";

/** How a pushed value reaches the sketch. */
export type Binding =
  /** digitalRead: 0 or 1. */
  | { kind: "digital"; pin: number }
  /** analogRead: 0 to 1023. */
  | { kind: "analog"; pin: number }
  /** pulseIn on the echo pin: the echo's length in microseconds. */
  | { kind: "echo-us"; pin: number }
  /** NewPing on the trigger pin: the distance in centimeters. */
  | { kind: "distance-cm"; pin: number }
  /** The DHT adapter: temperature and humidity in tenths, packed. */
  | { kind: "dht"; pin: number; model: 11 | 22 };

export interface BoundSensor {
  /** The sensor id in SET frames. */
  id: number;
  /** The lab node, and which of its inputs feeds this binding ("hc-sr04", or "soil-moisture:A0"). */
  nodeId: string;
  inputId: string;
  binding: Binding;
}

export interface HybridBindings {
  plan: HybridPlan;
  sensors: BoundSensor[];
  /** Virtual parts Kiungo can't play on a real board yet (I2C and 1-Wire sensors), and outputs marked virtual. */
  unsupported: Array<{ node: LabNode; why: string }>;
  /** Parts on the desk: the board reads and drives these for real. */
  physical: LabNode[];
}

/** Whether a part is played by Kiungo in a Hybrid run. Parts are virtual unless marked Physical or Hybrid. */
export const isVirtual = (node: LabNode) => node.mode === "virtual";

/** Whether the board runs the program for real: marked Physical or Hybrid in the Inspector. */
export const boardIsReal = (node: LabNode | undefined) =>
  node?.mode === "physical" || node?.mode === "hybrid";

/** A virtual sensor on the Hybrid board: where its pins are, and how to bind one. */
interface Binder {
  node: LabNode;
  /** The Arduino pin number a part pin is wired to on the Hybrid board. */
  pinOf: (pin: string) => number | null;
  add: (
    inputId: string,
    binding: Binding,
    part: string,
    adapter?: VirtualSensor["adapter"] | "DHT",
  ) => void;
}

function bindHcSr04({ node, pinOf, add }: Binder) {
  const trig = pinOf("TRIG");
  const echo = pinOf("ECHO");
  if (trig !== null) add(node.id, { kind: "distance-cm", pin: trig }, "hc-sr04", "NewPing");
  if (echo !== null) add(node.id, { kind: "echo-us", pin: echo }, "hc-sr04");
}

function bindDht({ node, pinOf, add }: Binder) {
  const pin = pinOf("DATA");
  if (pin !== null)
    add(
      node.id,
      { kind: "dht", pin, model: node.partId === "dht11" ? 11 : 22 },
      node.partId,
      "DHT",
    );
}

function bindPir({ node, pinOf, add }: Binder) {
  const pin = pinOf("OUT");
  if (pin !== null) add(node.id, { kind: "digital", pin }, "pir");
}

function bindLdr({ node, pinOf, add }: Binder) {
  const pin = pinOf("L2");
  if (pin !== null && pin >= 14) add(node.id, { kind: "analog", pin }, "ldr");
}

/** Soil moisture and MQ-2: an analog A0 and a threshold D0. */
function bindAnalogAndThreshold({ node, pinOf, add }: Binder) {
  const a = pinOf("A0");
  const d = pinOf("D0");
  if (a !== null && a >= 14) add(`${node.id}:A0`, { kind: "analog", pin: a }, node.partId);
  if (d !== null) add(`${node.id}:D0`, { kind: "digital", pin: d }, node.partId);
}

const BINDERS = new Map<string, (b: Binder) => void>([
  ["hc-sr04", bindHcSr04],
  ["dht11", bindDht],
  ["dht22", bindDht],
  ["am2302", bindDht],
  ["pir", bindPir],
  ["ldr", bindLdr],
  ["soil-moisture", bindAnalogAndThreshold],
  ["mq2", bindAnalogAndThreshold],
]);

/** Sensors on a bus the Hybrid shim doesn't carry yet. */
const NOT_IN_SHIM = new Set(["ds18b20", "mpu6050", "bmp280"]);

/**
 * The bindings for a Hybrid run of `boardId`. Throws when there are more
 * virtual sensor pins than the runtime's table holds.
 */
export function hybridBindings(
  nodes: LabNode[],
  analysis: Analysis,
  boardId: string,
  fqbn = "arduino:avr:uno",
): HybridBindings {
  const sensors: BoundSensor[] = [];
  const shimSensors: VirtualSensor[] = [];
  const unsupported: HybridBindings["unsupported"] = [];
  const physical: LabNode[] = [];
  const add = (
    node: LabNode,
    inputId: string,
    binding: Binding,
    part: string,
    adapter?: VirtualSensor["adapter"] | "DHT",
  ) => {
    const id = sensors.length;
    if (id >= MAX_SENSORS)
      throw new Error(
        `A Hybrid run can play up to ${MAX_SENSORS} virtual sensor pins. Mark some parts Physical.`,
      );
    sensors.push({ id, nodeId: node.id, inputId, binding });
    shimSensors.push({
      id,
      part,
      pins: [binding.pin],
      ...(adapter ? { adapter: adapter as VirtualSensor["adapter"] } : {}),
    });
  };

  for (const node of nodes) {
    if (node.id === boardId) continue;
    const report = analysis.nodes[node.id];
    if (!report?.links.some((l) => l.board === boardId)) continue;
    const bind = BINDERS.get(node.partId);
    if (isVirtual(node) && bind) {
      bind({
        node,
        pinOf: (pin) => {
          const l = report.links.find((x) => x.pin === pin && x.board === boardId);
          return l ? arduinoPinOf(l.boardPin) : null;
        },
        add: (...args) => add(node, ...args),
      });
    } else if (isVirtual(node) && NOT_IN_SHIM.has(node.partId)) {
      unsupported.push({
        node,
        why: `Kiungo can't play a virtual ${node.label} on a real board yet: its bus isn't in the Hybrid shim. Mark it Physical and wire the real one.`,
      });
    } else {
      // Outputs are always real in a Hybrid run: the board drives what's on the desk, and the lab mirrors it.
      physical.push(node);
    }
  }
  return { plan: { board: fqbn, sensors: shimSensors }, sensors, unsupported, physical };
}

const outOfRange = (cm: number) => cm < HC_SR04_RANGE_CM.min || cm > HC_SR04_RANGE_CM.max;

/** The value a binding takes from the lab's reading, or null when the reading isn't for it. */
function valueFor(b: Binding, input: PeripheralInput, logicV: number): number | null {
  if (b.kind === "distance-cm" && input.kind === "hc-sr04")
    return outOfRange(input.distanceCm) ? 0 : Math.round(input.distanceCm);
  if (b.kind === "echo-us" && input.kind === "hc-sr04")
    return outOfRange(input.distanceCm) ? 38_000 : Math.round(input.distanceCm * ECHO_US_PER_CM);
  if (b.kind === "dht" && input.kind === "dht") return packDht(input.temperatureC, input.humidity);
  if (b.kind === "digital" && input.kind === "digital") return input.high ? 1 : 0;
  if (b.kind === "analog" && input.kind === "analog")
    return Math.max(0, Math.min(1023, Math.round((input.volts / logicV) * 1023)));
  return null;
}

/** The values to push for the lab's current sensor readings: [sensor id, value] pairs (SET frames). */
export function hybridValues(
  bindings: HybridBindings,
  inputs: readonly PeripheralInput[],
  logicV = 5,
): Array<[number, number]> {
  const byId = new Map(inputs.map((i) => [i.id, i]));
  const out: Array<[number, number]> = [];
  for (const s of bindings.sensors) {
    const input = byId.get(s.inputId);
    const value = input ? valueFor(s.binding, input, logicV) : null;
    if (value !== null) out.push([s.id, value]);
  }
  return out;
}

/** Temperature and humidity in tenths, in one 32-bit value: the DHT adapter unpacks it. */
export function packDht(temperatureC: number, humidity: number): number {
  const t = Math.max(-400, Math.min(800, Math.round(temperatureC * 10)));
  const h = Math.max(0, Math.min(1000, Math.round(humidity * 10)));
  return ((t & 0xffff) << 16) | h;
}

const PART_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ADAPTERS = new Set(["NewPing", "DHT"]);

/** One sensor of a plan from the interface, or why it was refused. */
function planSensor(s: unknown): VirtualSensor | string {
  if (!s || typeof s !== "object") return "Refused: that isn't a Hybrid plan.";
  const { id, part, adapter, pins } = s as VirtualSensor;
  if (typeof part !== "string" || !PART_ID.test(part))
    return "Refused: a part in the plan has an unknown id.";
  if (adapter !== undefined && !ADAPTERS.has(adapter))
    return "Refused: a part in the plan asks for an unknown adapter.";
  if (!Array.isArray(pins) || pins.length > 4 || !pins.every((p) => Number.isInteger(p)))
    return "Refused: a part in the plan has bad pins.";
  if (!Number.isInteger(id)) return "Refused: a part in the plan has a bad id.";
  return { id, part, pins: [...pins], ...(adapter ? { adapter } : {}) };
}

/**
 * A plan from the interface, checked before it reaches the generated header:
 * part ids end up in a C comment, so only plain ids pass. Returns the plan for
 * `fqbn`, or why it was refused.
 */
export function parsePlan(
  value: unknown,
  fqbn: string,
): { ok: true; plan: HybridPlan } | { ok: false; message: string } {
  const refused = (message: string) => ({ ok: false as const, message });
  if (!value || typeof value !== "object" || !Array.isArray((value as HybridPlan).sensors))
    return refused("Refused: that isn't a Hybrid plan.");
  const raw = (value as HybridPlan).sensors;
  if (raw.length > MAX_SENSORS)
    return refused(`A Hybrid run can play up to ${MAX_SENSORS} virtual sensor pins.`);
  const sensors: VirtualSensor[] = [];
  for (const s of raw as unknown[]) {
    const sensor = planSensor(s);
    if (typeof sensor === "string") return refused(sensor);
    sensors.push(sensor);
  }
  const plan: HybridPlan = { board: fqbn, sensors };
  try {
    pinTable(plan);
  } catch (e) {
    return refused((e as Error).message);
  }
  return { ok: true, plan };
}

/** The boards a Hybrid run supports: the shim's pin table is the ATmega328's. */
export const HYBRID_BOARDS = new Set(["uno", "nano", "nano-old"]);

/**
 * What a real board drove, as the lab's pin readings (OUT-01): written pins
 * are high or low, PWM pins carry their duty; pins the sketch never wrote are
 * inputs. Tone and servo pulses aren't measured on the board yet.
 */
export function outReadings(
  out: { levels: number; driven: number; pwm: Array<[number, number]> },
  pins = 20,
): PinReading[] {
  const pwm = new Map(out.pwm);
  const readings: PinReading[] = [];
  for (let pin = 0; pin < pins; pin++) {
    const bit = 2 ** pin;
    const driven = Math.floor(out.driven / bit) % 2 === 1;
    if (!driven) continue;
    const duty = pwm.has(pin)
      ? (pwm.get(pin) as number) / 255
      : Math.floor(out.levels / bit) % 2 === 1
        ? 1
        : 0;
    readings.push({ pin, level: duty >= 0.5 ? "high" : "low", duty, hz: 0, pulseUs: null });
  }
  return readings;
}
