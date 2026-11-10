import type { PeripheralInput } from "../emulator/peripherals";
import type { BoardSettings, SensorSample } from "./sketch";
import type { LabNode } from "./types";

/** A sensor on the program's board, read now, and where to put what the emulator should see. */
export interface ProgramSensor {
  node: LabNode;
  /** The Arduino pin number a sensor pin is wired to. */
  pinOf: (pin: string) => number | null;
  v: SensorSample["values"];
  settings: BoardSettings;
  logicV: number;
  out: PeripheralInput[];
}

function hcSr04(s: ProgramSensor) {
  const trig = s.pinOf("TRIG");
  const echo = s.pinOf("ECHO");
  if (trig !== null && echo !== null)
    s.out.push({ kind: "hc-sr04", id: s.node.id, trig, echo, distanceCm: s.v.distanceCm ?? 30 });
}

function dht(s: ProgramSensor) {
  const pin = s.pinOf("DATA");
  if (pin !== null)
    s.out.push({
      kind: "dht",
      id: s.node.id,
      pin,
      model: s.node.partId === "dht11" ? 11 : 22,
      temperatureC: s.v.temperatureC ?? 22,
      humidity: s.v.humidity ?? 50,
    });
}

function pir(s: ProgramSensor) {
  const pin = s.pinOf("OUT");
  if (pin !== null)
    s.out.push({ kind: "digital", id: s.node.id, pin, high: (s.v.motion ?? 0) > 0 });
}

function ldr(s: ProgramSensor) {
  // The LDR and its 10 kΩ make a divider: brighter light, higher voltage.
  const pin = s.pinOf("L2");
  if (pin !== null && pin >= 14)
    s.out.push({ kind: "analog", id: s.node.id, pin, volts: ((s.v.light ?? 50) / 100) * s.logicV });
}

function soilMoisture(s: ProgramSensor) {
  // Wetter soil, lower voltage on A0; D0 goes low past the module's threshold.
  const a = s.pinOf("A0");
  const d = s.pinOf("D0");
  const wet = (s.v.moisture ?? 45) / 100;
  if (a !== null && a >= 14)
    s.out.push({ kind: "analog", id: `${s.node.id}:A0`, pin: a, volts: (1 - wet) * s.logicV });
  if (d !== null)
    s.out.push({
      kind: "digital",
      id: `${s.node.id}:D0`,
      pin: d,
      high: (s.v.moisture ?? 45) < s.settings.dryPct,
    });
}

function mq2(s: ProgramSensor) {
  const a = s.pinOf("A0");
  const d = s.pinOf("D0");
  const ppm = s.v.gasPpm ?? 300;
  if (a !== null && a >= 14)
    s.out.push({
      kind: "analog",
      id: `${s.node.id}:A0`,
      pin: a,
      volts: Math.min(1, ppm / 1000) * s.logicV,
    });
  if (d !== null)
    s.out.push({ kind: "digital", id: `${s.node.id}:D0`, pin: d, high: ppm <= s.settings.gasPpm });
}

/** Sensors the emulator's part models answer for, by part id. */
export const SENSOR_INPUTS = new Map<string, (s: ProgramSensor) => void>([
  ["hc-sr04", hcSr04],
  ["dht11", dht],
  ["dht22", dht],
  ["am2302", dht],
  ["pir", pir],
  ["ldr", ldr],
  ["soil-moisture", soilMoisture],
  ["mq2", mq2],
]);
