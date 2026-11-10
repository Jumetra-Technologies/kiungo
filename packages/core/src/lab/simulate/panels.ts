import { formatOhms } from "../../parts/models/passives";
import type { Analysis } from "../circuit";
import { breadboardUse, railSummary, type StripUse } from "../breadboard";
import { ohmsOf } from "../controls";
import type { Pinout } from "../pinout";
import { displayLines, type BoardPlan, type Inputs } from "../sketch";
import type { LabNode } from "../types";
import { DISPLAYS, RADIOS, fmt, square, type NodeLive, type PartCtx } from "./live";

function displayLive(c: PartCtx): NodeLive {
  const { board, go, plan, node, t, silentByBoard } = c;
  const silent = board ? (silentByBoard.get(board) ?? []) : [];
  const lines = go
    ? displayLines(
        node.partId,
        plan.samples,
        t,
        silent.map((n) => n.label),
      )
    : [];
  c.setLinks(() => (go ? 0.5 : 0));
  const sources = [
    ...plan.samples.map((s) => `${s.node.label} (${s.held ? "set" : "simulated"})`),
    ...silent.map((n) => `${n.label} (no data)`),
  ];
  return {
    on: go,
    level: go ? 1 : 0,
    text: lines,
    readings: go
      ? [
          { label: "Showing", value: lines.join(" · ") },
          {
            label: "Source",
            value: sources.length ? sources.join(", ") : "No sensor on this board",
          },
        ]
      : [],
    badge: go ? "Showing" : "Blank",
  };
}

function radioStatus(partId: string, up: boolean, t: number): string {
  if (partId === "hc-05") return up ? "Paired" : "Discoverable";
  if (partId === "wifi-module") return up ? "Connected, 192.168.4.2" : "Joining…";
  if (partId === "nrf24l01") return `${Math.floor(t * 4)} packets sent`;
  return `${Math.floor(t / 2)} packets, RSSI −87 dBm`;
}

function radioLive(c: PartCtx): NodeLive {
  const { go, t, node } = c;
  const up = go && t > 2.5;
  const status = radioStatus(node.partId, up, t);
  c.setLinks(() => (go ? square(t, 0.5, 0.3) : 0));
  return {
    on: go,
    level: go ? (up ? 1 : square(t, 0.3)) : 0,
    readings: go ? [{ label: "Status", value: status }] : [],
    badge: go ? (up ? "Linked" : "Pairing") : "Idle",
  };
}

/** Displays, radios, and anything else with no behavior of its own. */
export function otherLive(c: PartCtx): NodeLive {
  if (DISPLAYS.has(c.node.partId)) return displayLive(c);
  if (RADIOS.has(c.node.partId)) return radioLive(c);
  const { go } = c;
  return {
    on: go,
    level: go ? 1 : 0,
    readings: [],
    badge: go ? "Running" : undefined,
  };
}

export function resistorLive(node: LabNode, inputs: Inputs): NodeLive {
  return {
    on: false,
    level: 0,
    readings: [{ label: "Value", value: formatOhms(ohmsOf(inputs, node.id)) }],
  };
}

function stripValue(u: StripUse): string {
  if (u.kind === "power") return u.net;
  if (u.kind === "ground") return "GND";
  if (u.kind === "short") return "Short!";
  if (u.kind === "open") return "Not connected";
  return u.net;
}

/** A breadboard runs nothing; its panel says what each wired strip carries. */
export function breadboardLive(node: LabNode, analysis: Analysis, nodes: LabNode[]): NodeLive {
  const use = breadboardUse(node.id, analysis, nodes);
  return {
    on: false,
    level: 0,
    readings: use.slice(0, 6).map((u) => ({ label: u.name, value: stripValue(u) })),
    badge: railSummary(use),
  };
}

function sketchText(plan: BoardPlan, running: boolean): string {
  const { alertSensor, alert, samples, settings } = plan;
  if (!running) return "Stopped";
  if (alertSensor) return `${alertSensor.node.label} → outputs${alert ? " (on)" : " (off)"}`;
  return samples.length ? "Read and show" : `Blink, delay ${settings.delayMs} ms`;
}

function boardBadge(powered: boolean, running: boolean, ledUsed: boolean, blink: number): string {
  if (!powered) return "Off";
  if (!running) return "Idle";
  if (ledUsed) return "Running";
  return blink ? "L on" : "L off";
}

/** A board: its sketch, power and the built-in LED it blinks when the LED's pin is free. */
export function controllerLive(
  { node, report, plan, t, running }: Pick<PartCtx, "node" | "report" | "plan" | "t" | "running">,
  pinout: Pinout,
  pins: Record<string, number>,
): NodeLive {
  const powered = report?.powered ?? true;
  const ledPin = pinout.pins.find((p) => p.fns?.includes("led"));
  const ledUsed = Boolean(ledPin && report?.wiredPins.has(ledPin.id));
  const blink = running && powered && !ledUsed ? square(t, (2 * plan.settings.delayMs) / 1000) : 0;
  if (ledPin && !ledUsed) pins[`${node.id}:${ledPin.id}`] = blink;
  return {
    on: powered,
    level: blink,
    readings: [
      { label: "Power", value: powered ? `USB, ${pinout.logic} V logic` : "Off" },
      { label: "Sketch", value: sketchText(plan, running) },
      ...(running ? [{ label: "Uptime", value: `${fmt(t)} s` }] : []),
    ],
    badge: boardBadge(powered, running, ledUsed, blink),
  };
}
