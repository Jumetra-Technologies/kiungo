import type { Analysis } from "../circuit";
import { inputOf, isSensorPart } from "../controls";
import { getPinout } from "../pinout";
import { boardSettings, sampleSensor, type BoardPlan, type Inputs } from "../sketch";
import type { LabNode } from "../types";

export interface Reading {
  label: string;
  value: string;
}

export interface NodeLive {
  /** Lit, energised, spinning or reading. */
  on: boolean;
  /** 0–1: brightness, duty, speed. */
  level: number;
  angle?: number;
  rgb?: [number, number, number];
  readings: Reading[];
  /** Lines on a display. */
  text?: string[];
  /** Short state for the node badge: "ON", "23.4 °C", "90°". */
  badge?: string;
  /**
   * What a sounder is being driven with, for the audio engine: its pitch and
   * the pin's on/off pattern in simulated time (on while
   * ((t + phase) mod period) < period × duty). Null when silent.
   */
  tone?: { hz: number; pattern: PinPattern } | null;
}

/** A pin switched on and off at a steady rate, as `square()` draws it. */
export interface PinPattern {
  period: number;
  duty: number;
  phase: number;
}

/** An active buzzer's own oscillator: one fixed pitch, near its piezo's resonance. */
export const ACTIVE_BUZZER_HZ = 2300;

export type WireFlow = "power" | "ground" | "signal" | "data" | "idle" | "fault";

export interface WireLive {
  flow: WireFlow;
  /** 0–1. 0 means no current right now. */
  level: number;
}

export interface Frame {
  t: number;
  running: boolean;
  nodes: Record<string, NodeLive>;
  pins: Record<string, number>;
  wires: Record<string, WireLive>;
}

/** 28BYJ-48 through its gearbox: steps per turn of the output shaft (full-step). */
export const STEPPER_STEPS_PER_TURN = 2048;
/** The TT gear motor's no-load speed at full duty. */
export const DC_MOTOR_MAX_RPM = 140;

export const square = (t: number, period: number, duty = 0.5, phase = 0) =>
  (((t + phase) % period) + period) % period < period * duty ? 1 : 0;
export const fmt = (n: number, digits = 1) => n.toFixed(digits);

/** The logic voltage of a board's pins (5 V on an Uno, 3.3 V on an ESP32). */
export function boardLogicV(nodes: LabNode[], boardId: string | null): number {
  const board = boardId ? nodes.find((n) => n.id === boardId) : undefined;
  return board ? getPinout(board.partId).logic : 5;
}

/** Index of each output part among the outputs on its board, so patterns can be staggered. */
export function outputOrder(nodes: LabNode[], analysis: Analysis): Map<string, number> {
  const order = new Map<string, number>();
  const perBoard = new Map<string, number>();
  for (const node of nodes) {
    const report = analysis.nodes[node.id];
    const link = report?.links.find((l) => l.role === "drive" || l.role === "pwm");
    if (!link) continue;
    const k = perBoard.get(link.board) ?? 0;
    order.set(node.id, k);
    perBoard.set(link.board, k + 1);
  }
  return order;
}

/** A sensor's reading at time t with no inputs: the simulated sweep. Kept for the Signals panel and older callers. */
export function sensorReadings(
  partId: string,
  t: number,
): { readings: Reading[]; level: number; on: boolean; badge?: string } {
  const s = sampleSensor(
    { id: "", partId, label: partId, x: 0, y: 0, mode: "virtual" },
    t,
    undefined,
    boardSettings(null, undefined),
  );
  return { readings: s.readings, level: s.level, on: s.on, badge: s.badge };
}

export const DISPLAYS = new Set(["lcd-16x2", "oled-ssd1306", "tft-display"]);
export const RADIOS = new Set(["hc-05", "wifi-module", "nrf24l01", "lora"]);

export function isSensor(partId: string) {
  return isSensorPart(partId);
}

export function isDisplay(partId: string) {
  return DISPLAYS.has(partId);
}

/**
 * Whether a part runs: ready, or wired with only a signal-level fault. A real
 * part would run out of spec there too, so the lab shows it working and
 * keeps the fault in the list.
 */
export function runnable(report: Analysis["nodes"][string] | undefined): boolean {
  if (!report) return false;
  if (report.status === "ready") return true;
  return (
    report.status === "fault" &&
    report.powered &&
    report.faults.every((f) => f.severity !== "error" || f.id.startsWith("level"))
  );
}

/** The board a peripheral takes its signal from. */
export function boardFor(report: Analysis["nodes"][string] | undefined): string | null {
  const links = report?.links ?? [];
  return links.find((l) => !["vcc", "gnd"].includes(l.role))?.board ?? links[0]?.board ?? null;
}

/**
 * Where a commanded stepper is at time t, in steps of the output shaft,
 * accumulated since the position was last zeroed. A command moves from
 * `cmdFrom` to `cmdTarget` at `stepsPerSecond`, starting at `cmdAt`, then
 * holds. With no command the shaft holds at `cmdFrom` (0 by default).
 */
export function stepperStepsAt(inputs: Inputs, nodeId: string, t: number): number {
  const from = inputOf(inputs, nodeId, "cmdFrom", 0);
  const target = inputOf(inputs, nodeId, "cmdTarget", from);
  const at = inputOf(inputs, nodeId, "cmdAt", 0);
  const sps = Math.max(1, inputOf(inputs, nodeId, "stepsPerSecond", 256));
  const distance = Math.abs(target - from);
  const traveled = Math.min(distance, Math.max(0, t - at) * sps);
  return Math.round(from + Math.sign(target - from) * traveled);
}

/** What every output part's frame needs from the build and the moment. */
export interface PartCtx {
  node: LabNode;
  nodes: LabNode[];
  report: Analysis["nodes"][string] | undefined;
  t: number;
  running: boolean;
  ready: boolean;
  /** Running and ready. */
  go: boolean;
  /** The part's place among the outputs on its board, to stagger patterns. */
  k: number;
  board: string | null;
  plan: BoardPlan;
  /** The blink period from the board's delay, in seconds. */
  period: number;
  /** Whether the person set the part's own command. */
  held: boolean;
  inputs: Inputs;
  /** Sensors on each board that can't give a reading. */
  silentByBoard: Map<string, LabNode[]>;
  /** Write a level to each of the part's linked pins and the board pins they're on. */
  setLinks: (fn: (role: string, pin: string) => number) => void;
}
