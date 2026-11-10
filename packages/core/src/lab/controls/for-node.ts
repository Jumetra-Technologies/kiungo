import { type LabNode, type NodeInputs } from "../types";
import { DEFAULT_OHMS } from "../../parts/models/passives";
import {
  ACTUATOR_CONTROLS,
  BOARD_CONTROLS,
  PASSIVE_CONTROLS,
  SENSOR_CONTROLS,
  stripWhen,
} from "./tables";
import { type Analysis } from "../circuit";
import { SOURCE_AUTO, SOURCE_KEY, SOURCE_SET, type Control } from "./control";
import { getPinout } from "../pinout";

/** A resistor's value in ohms, as set in the lab (220 Ω if not). */
export function ohmsOf(inputs: Record<string, NodeInputs> | undefined, nodeId: string): number {
  const v = Number(inputs?.[nodeId]?.ohms);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_OHMS;
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
export function controlsFor(
  node: LabNode,
  nodes: LabNode[],
  analysis: Analysis,
): { title: string; controls: Control[]; note?: string } {
  const pinout = getPinout(node.partId);
  if (pinout.controller) {
    const parts = partsOnBoard(node.id, nodes, analysis);
    return {
      title: "Sketch settings",
      controls: BOARD_CONTROLS.filter((c) => c.when(parts)).map((c) => stripWhen(c)),
    };
  }
  const passive = PASSIVE_CONTROLS[node.partId];
  if (passive) return { title: "Value", controls: passive };
  const surroundings = SENSOR_CONTROLS[node.partId];
  if (surroundings) return { title: "Surroundings", controls: surroundings };
  if (FOLLOWERS.has(node.partId)) {
    const board = boardOf(node.id, analysis);
    const driver = board ? drivingSensor(node.partId, partsOnBoard(board, nodes, analysis)) : null;
    if (driver)
      return {
        title: "Command",
        controls: [],
        note: `Driven by the sketch from the ${driver} on this board: on while its condition holds. Change the ${driver}'s input or the board's settings.`,
      };
    return {
      title: "Command",
      controls: [],
      note: board
        ? "Blinks with the board's delay. Select the board to change it, or wire a sensor to the board for the sketch to follow."
        : "",
    };
  }
  const command = ACTUATOR_CONTROLS[node.partId];
  if (command) {
    const board = boardOf(node.id, analysis);
    const driver = board ? drivingSensor(node.partId, partsOnBoard(board, nodes, analysis)) : null;
    if (driver)
      return {
        title: "Command",
        controls: [],
        note: `Driven by the sketch from the ${driver} on this board. Change the ${driver}'s input or the board's sketch settings.`,
      };
    return { title: "Command", controls: command };
  }
  return { title: "Inputs", controls: [] };
}

/** Which sensor on the board, if any, the sketch uses to drive this kind of actuator. */
export function drivingSensor(partId: string, parts: Set<string>): string | null {
  if (partId === "servo") return parts.has("pir") ? "PIR sensor" : null;
  if (partId === "led" || partId === "buzzer" || partId === "relay") {
    for (const s of ["hc-sr04", "pir", "mq2", "soil-moisture", "ldr"])
      if (parts.has(s)) return SENSOR_NAMES[s] ?? null;
  }
  return null;
}

const SENSOR_NAMES: Record<string, string> = {
  "hc-sr04": "ultrasonic sensor",
  pir: "PIR sensor",
  mq2: "gas sensor",
  "soil-moisture": "soil moisture sensor",
  ldr: "light sensor",
};

/** Read an input with its declared default. */
export function inputOf<T extends number | string | boolean>(
  inputs: Record<string, NodeInputs> | undefined,
  nodeId: string,
  key: string,
  fallback: T,
): T extends number ? number : T extends string ? string : boolean {
  const v = inputs?.[nodeId]?.[key];
  return (typeof v === typeof fallback ? v : fallback) as T extends number
    ? number
    : T extends string
      ? string
      : boolean;
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
  const list = pinout.controller
    ? BOARD_CONTROLS
    : (SENSOR_CONTROLS[partId] ?? ACTUATOR_CONTROLS[partId] ?? PASSIVE_CONTROLS[partId] ?? []);
  return list.find((c) => c.key === key);
}

/** Default for a key, as declared. */
export function defaultOf(partId: string, key: string): number | string | boolean | undefined {
  return findControl(partId, key)?.default;
}
