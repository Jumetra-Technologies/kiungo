/**
 * Lab session helpers with no browser or store dependencies, shared by the
 * website, the desktop app and the MCP server.
 */

import { getPart } from "../parts";
import type { LabNode, LabSession, LabWire, LogEntry, LogKind } from "./types";

export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

const now = () => new Date().toISOString();

export function logEntry(kind: LogKind, text: string, nodes?: string[]): LogEntry {
  return { id: makeId("log"), at: now(), kind, text, ...(nodes?.length ? { nodes } : {}) };
}

export function newSession(
  input: { name?: string; projectId?: string | null; nodes?: LabNode[]; wires?: LabWire[] } = {},
): LabSession {
  const at = now();
  const name = input.name?.trim() || "Untitled lab";
  return {
    id: makeId("lab"),
    name,
    projectId: input.projectId ?? null,
    createdAt: at,
    updatedAt: at,
    nodes: input.nodes ?? [],
    wires: input.wires ?? [],
    log: [logEntry("session", `Session “${name}” started`)],
    view: "top",
    runMs: 0,
    inputs: {},
    runtime: null,
  };
}

/** Short names for the canvas; catalog names are written for the library. */
const SHORT: Record<string, string> = {
  "arduino-uno": "Arduino Uno",
  "arduino-mega": "Arduino Mega",
  esp32: "ESP32",
  esp8266: "NodeMCU",
  "raspberry-pi-pico": "Pico",
  "raspberry-pi-4": "Raspberry Pi 4",
  stm32: "Blue Pill",
  microbit: "micro:bit",
  teensy: "Teensy 4.1",
  dht11: "DHT11",
  dht22: "DHT22",
  am2302: "AM2302",
  "hc-sr04": "HC-SR04",
  pir: "PIR sensor",
  ldr: "LDR",
  ds18b20: "DS18B20",
  "soil-moisture": "Soil sensor",
  mq2: "MQ-2",
  mpu6050: "MPU-6050",
  bmp280: "BMP280",
  led: "LED",
  resistor: "Resistor",
  "breadboard-full": "Full breadboard",
  "breadboard-mini": "Mini breadboard",
  "rgb-led": "RGB LED",
  buzzer: "Buzzer",
  servo: "Servo",
  "dc-motor": "DC motor",
  relay: "Relay",
  "stepper-motor": "Stepper",
  "lcd-16x2": "LCD 16×2",
  "oled-ssd1306": "OLED",
  "tft-display": "TFT display",
  "hc-05": "HC-05",
  "wifi-module": "ESP-01",
  nrf24l01: "nRF24",
  lora: "LoRa",
};

export function shortName(partId: string): string {
  return (
    SHORT[partId] ??
    ((getPart(partId)?.name ?? partId).split(",")[0] ?? "").replace(/\s*\(.*\)\s*$/, "")
  );
}

/** A unique, readable label: "LED", "LED 2", … */
export function nextLabel(nodes: LabNode[], partId: string): string {
  const short = shortName(partId);
  const taken = new Set(nodes.map((n) => n.label));
  if (!taken.has(short)) return short;
  for (let i = 2; ; i++) if (!taken.has(`${short} ${i}`)) return `${short} ${i}`;
}
