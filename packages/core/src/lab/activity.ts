/**
 * Turns what happens in the lab into a readable project log.
 *
 * Edits are compared analysis to analysis, so the log records milestones
 * ("LED is ready", "Arduino Uno connected to Raspberry Pi 4 over UART",
 * faults found and fixed) rather than every click. Runs are recorded frame by
 * frame and written up once: the first time each part comes alive, then a
 * summary when the run stops.
 */

import type { Analysis } from "./circuit";
import { getPinout } from "./pinout";
import type { Frame } from "./simulate";
import type { LabNode, LogKind } from "./types";

export interface Draft {
  kind: LogKind;
  text: string;
  nodes?: string[];
}

const BUS_NAME = { uart: "UART", i2c: "I²C", spi: "SPI", gpio: "a GPIO line", power: "a shared supply" } as const;

export function describeChanges(prev: Analysis | null, next: Analysis, nodes: LabNode[]): Draft[] {
  if (!prev) return [];
  const drafts: Draft[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.label ?? "a part";

  for (const node of nodes) {
    const before = prev.nodes[node.id]?.status;
    const after = next.nodes[node.id]?.status;
    if (!after || before === after || getPinout(node.partId).controller) continue;
    if (after === "ready") {
      const report = next.nodes[node.id];
      const link = report.links.find((l) => !["vcc", "gnd"].includes(l.role));
      const via = link ? ` on ${label(link.board)} ${getPinout(byId.get(link.board)!.partId).pins.find((p) => p.id === link.boardPin)?.label ?? link.boardPin}` : "";
      drafts.push({ kind: "state", text: `${node.label} is wired and powered${via}`, nodes: [node.id] });
    }
  }

  const seen = new Set(prev.boardLinks.map((l) => [l.a, l.b].sort().join("|") + l.bus));
  const announced = new Set<string>();
  for (const link of next.boardLinks) {
    const key = [link.a, link.b].sort().join("|") + link.bus;
    if (seen.has(key) || announced.has(key)) continue;
    announced.add(key);
    drafts.push({ kind: "wire", text: `${label(link.a)} connected to ${label(link.b)} over ${BUS_NAME[link.bus]}`, nodes: [link.a, link.b] });
  }

  const before = new Map(prev.faults.filter((f) => f.severity !== "tip").map((f) => [f.id, f]));
  const after = new Map(next.faults.filter((f) => f.severity !== "tip").map((f) => [f.id, f]));
  for (const [id, f] of after) {
    if (!before.has(id)) drafts.push({ kind: "fault", text: `${f.severity === "error" ? "Fault" : "Warning"} on ${f.nodes.map(label).join(", ")}: ${f.title}`, nodes: f.nodes });
  }
  for (const [id, f] of before) {
    // A fault on a part that was removed isn't "fixed".
    if (!after.has(id) && f.nodes.every((n) => byId.has(n))) drafts.push({ kind: "fix", text: `Fixed on ${f.nodes.map(label).join(", ")}: ${f.title}`, nodes: f.nodes });
  }
  return drafts;
}

interface Track {
  on: boolean;
  firstOnLogged: boolean;
  toggles: number;
  min: number;
  max: number;
  unit: string;
  readingLabel: string;
}

const numberOf = (value: string): { n: number; unit: string } | null => {
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? { n: Number(m[1]), unit: m[2].trim() } : null;
};

/** Records one run of the simulation and writes it up. */
export class RunRecorder {
  private tracks = new Map<string, Track>();
  private startT = 0;
  private lastT = 0;
  constructor(private nodes: LabNode[]) {}

  start(t: number) {
    this.startT = t;
    this.lastT = t;
    this.tracks.clear();
  }

  setNodes(nodes: LabNode[]) {
    this.nodes = nodes;
  }

  /** Feed a frame; returns log lines for things that happened for the first time. */
  frame(frame: Frame, analysis: Analysis): Draft[] {
    this.lastT = frame.t;
    const drafts: Draft[] = [];
    for (const node of this.nodes) {
      const live = frame.nodes[node.id];
      if (!live) continue;
      const controller = getPinout(node.partId).controller;
      if (controller) continue;
      let track = this.tracks.get(node.id);
      if (!track) {
        track = { on: false, firstOnLogged: false, toggles: 0, min: Infinity, max: -Infinity, unit: "", readingLabel: "" };
        this.tracks.set(node.id, track);
      }
      if (live.on !== track.on) {
        if (live.on) track.toggles += 1;
        track.on = live.on;
      }
      const reading = live.readings[0];
      const num = reading ? numberOf(reading.value) : null;
      if (num) {
        track.min = Math.min(track.min, num.n);
        track.max = Math.max(track.max, num.n);
        track.unit = num.unit;
        track.readingLabel = reading!.label;
      }
      if (live.on && !track.firstOnLogged) {
        track.firstOnLogged = true;
        const link = analysis.nodes[node.id]?.links.find((l) => !["vcc", "gnd"].includes(l.role));
        const board = link ? this.nodes.find((n) => n.id === link.board) : undefined;
        const boardPin = link && board ? getPinout(board.partId).pins.find((p) => p.id === link.boardPin)?.label : undefined;
        const via = board && boardPin ? ` (${board.label} ${boardPin})` : "";
        drafts.push({ kind: "run", text: firstOnText(node, live.badge, reading?.value) + via, nodes: [node.id] });
      }
    }
    return drafts;
  }

  /** The summary for the end of the run, and its length in ms. */
  stop(): { draft: Draft; ms: number } {
    const seconds = Math.max(0, this.lastT - this.startT);
    const parts: string[] = [];
    for (const node of this.nodes) {
      const track = this.tracks.get(node.id);
      if (!track) continue;
      if (Number.isFinite(track.min) && track.max !== track.min) {
        parts.push(`${node.label} ${track.readingLabel.toLowerCase()} ${fmt(track.min)}–${fmt(track.max)}${track.unit ? ` ${track.unit}` : ""}`);
      } else if (track.toggles > 1) {
        parts.push(`${node.label} ${toggleVerb(node.partId)} ${track.toggles} times`);
      } else if (track.toggles === 1) {
        parts.push(`${node.label} came on`);
      } else if (!track.firstOnLogged) {
        parts.push(`${node.label} stayed off`);
      }
    }
    const text = `Run stopped after ${seconds.toFixed(1)} s${parts.length ? `: ${parts.join("; ")}` : ""}`;
    return { draft: { kind: "run", text }, ms: seconds * 1000 };
  }
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));

function toggleVerb(partId: string) {
  if (partId === "led" || partId === "rgb-led") return "flashed";
  if (partId === "buzzer") return "beeped";
  if (partId === "relay") return "switched";
  if (partId === "pir") return "saw motion";
  return "switched on";
}

function firstOnText(node: LabNode, badge?: string, value?: string): string {
  switch (node.partId) {
    case "led":
      return `${node.label} flashes on`;
    case "rgb-led":
      return `${node.label} starts fading through colors`;
    case "buzzer":
      return `${node.label} beeps`;
    case "relay":
      return `${node.label} clicks: COM switches to NO`;
    case "servo":
      return `${node.label} moves to ${badge ?? "its angle"}`;
    case "dc-motor":
      return `${node.label} spins up${badge ? ` to ${badge}` : ""}`;
    case "stepper-motor":
      return `${node.label} starts stepping`;
    case "pir":
      return `${node.label} sees motion`;
    case "lcd-16x2":
    case "oled-ssd1306":
    case "tft-display":
      return `${node.label} shows “${value ?? "text"}”`;
    case "hc-05":
    case "wifi-module":
    case "nrf24l01":
    case "lora":
      return `${node.label} comes up: ${value ?? badge ?? "radio on"}`;
    default:
      if (value) return `${node.label} reads ${value}`;
      return `${node.label} is ${badge?.toLowerCase() ?? "running"}`;
  }
}
