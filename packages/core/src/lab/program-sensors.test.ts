import { describe, expect, it } from "vitest";
import type { PeripheralInput } from "../emulator/peripherals";
import { SENSOR_INPUTS, type ProgramSensor } from "./program-sensors";
import { boardSettings } from "./sketch";

function read(
  partId: string,
  pins: Record<string, number | null>,
  values: Record<string, number>,
  logicV = 5,
) {
  const out: PeripheralInput[] = [];
  const s: ProgramSensor = {
    node: { id: "s", partId, label: partId, x: 0, y: 0, mode: "virtual" },
    pinOf: (pin) => pins[pin] ?? null,
    v: values,
    settings: { ...boardSettings(null, undefined), dryPct: 30, gasPpm: 400 },
    logicV,
    out,
  };
  SENSOR_INPUTS.get(partId)!(s);
  return out;
}

describe("sensors answering the program", () => {
  it("an HC-SR04 on its trigger and echo pins, at the distance set", () => {
    expect(read("hc-sr04", { TRIG: 9, ECHO: 10 }, { distanceCm: 42 })).toEqual([
      { kind: "hc-sr04", id: "s", trig: 9, echo: 10, distanceCm: 42 },
    ]);
    expect(read("hc-sr04", { TRIG: 9 }, {})).toEqual([]);
  });

  it("a DHT11 or DHT22 on its data pin, as its own model", () => {
    expect(read("dht11", { DATA: 2 }, { temperatureC: 25, humidity: 40 })).toEqual([
      { kind: "dht", id: "s", pin: 2, model: 11, temperatureC: 25, humidity: 40 },
    ]);
    expect(read("am2302", { DATA: 2 }, {})[0]).toMatchObject({
      model: 22,
      temperatureC: 22,
      humidity: 50,
    });
  });

  it("a PIR high on motion; an LDR as the divider's voltage on an analog pin only", () => {
    expect(read("pir", { OUT: 3 }, { motion: 1 })).toEqual([
      { kind: "digital", id: "s", pin: 3, high: true },
    ]);
    expect(read("ldr", { L2: 14 }, { light: 50 }, 5)).toEqual([
      { kind: "analog", id: "s", pin: 14, volts: 2.5 },
    ]);
    expect(read("ldr", { L2: 7 }, { light: 50 })).toEqual([]);
  });

  it("soil moisture and gas: an analog level and a threshold pin, by the board's settings", () => {
    expect(read("soil-moisture", { A0: 15, D0: 4 }, { moisture: 20 })).toEqual([
      { kind: "analog", id: "s:A0", pin: 15, volts: 4 },
      { kind: "digital", id: "s:D0", pin: 4, high: true },
    ]);
    expect(read("mq2", { A0: 16, D0: 5 }, { gasPpm: 500 }, 5)).toEqual([
      { kind: "analog", id: "s:A0", pin: 16, volts: 2.5 },
      { kind: "digital", id: "s:D0", pin: 5, high: false },
    ]);
  });

  it("covers the sensors the emulator models, and only them", () => {
    expect([...SENSOR_INPUTS.keys()].sort()).toEqual([
      "am2302",
      "dht11",
      "dht22",
      "hc-sr04",
      "ldr",
      "mq2",
      "pir",
      "soil-moisture",
    ]);
  });
});
