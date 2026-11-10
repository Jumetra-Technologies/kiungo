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

const BUS_NAME = {
  uart: "UART",
  i2c: "I²C",
  spi: "SPI",
  gpio: "a GPIO line",
  power: "a shared supply",
} as const;

type Label = (id: string) => string;

/** Parts that just became ready, and the board pin each is on. */
function readyDrafts(prev: Analysis, next: Analysis, nodes: LabNode[], label: Label): Draft[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const drafts: Draft[] = [];
  for (const node of nodes) {
    const before = prev.nodes[node.id]?.status;
    const after = next.nodes[node.id]?.status;
    if (!after || before === after || getPinout(node.partId).controller) continue;
    if (after !== "ready") continue;
    const report = next.nodes[node.id];
    const link = report?.links.find((l) => !["vcc", "gnd"].includes(l.role));
    const via = link
      ? ` on ${label(link.board)} ${getPinout(byId.get(link.board)!.partId).pins.find((p) => p.id === link.boardPin)?.label ?? link.boardPin}`
      : "";
    drafts.push({
      kind: "state",
      text: `${node.label} is wired and powered${via}`,
      nodes: [node.id],
    });
  }
  return drafts;
}

/** Board-to-board links that are new. */
function linkDrafts(prev: Analysis, next: Analysis, label: Label): Draft[] {
  const drafts: Draft[] = [];
  const seen = new Set(prev.boardLinks.map((l) => [l.a, l.b].sort().join("|") + l.bus));
  const announced = new Set<string>();
  for (const link of next.boardLinks) {
    const key = [link.a, link.b].sort().join("|") + link.bus;
    if (seen.has(key) || announced.has(key)) continue;
    announced.add(key);
    drafts.push({
      kind: "wire",
      text: `${label(link.a)} connected to ${label(link.b)} over ${BUS_NAME[link.bus]}`,
      nodes: [link.a, link.b],
    });
  }
  return drafts;
}

/** Faults found, and faults fixed (not ones that went away with their part). */
function faultDrafts(prev: Analysis, next: Analysis, nodes: LabNode[], label: Label): Draft[] {
  const ids = new Set(nodes.map((n) => n.id));
  const drafts: Draft[] = [];
  const before = new Map(prev.faults.filter((f) => f.severity !== "tip").map((f) => [f.id, f]));
  const after = new Map(next.faults.filter((f) => f.severity !== "tip").map((f) => [f.id, f]));
  for (const [id, f] of after) {
    if (!before.has(id))
      drafts.push({
        kind: "fault",
        text: `${f.severity === "error" ? "Fault" : "Warning"} on ${f.nodes.map(label).join(", ")}: ${f.title}`,
        nodes: f.nodes,
      });
  }
  for (const [id, f] of before) {
    // A fault on a part that was removed isn't "fixed".
    if (!after.has(id) && f.nodes.every((n) => ids.has(n)))
      drafts.push({
        kind: "fix",
        text: `Fixed on ${f.nodes.map(label).join(", ")}: ${f.title}`,
        nodes: f.nodes,
      });
  }
  return drafts;
}

export function describeChanges(prev: Analysis | null, next: Analysis, nodes: LabNode[]): Draft[] {
  if (!prev) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.label ?? "a part";
  return [
    ...readyDrafts(prev, next, nodes, label),
    ...linkDrafts(prev, next, label),
    ...faultDrafts(prev, next, nodes, label),
  ];
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
  return m ? { n: Number(m[1]), unit: (m[2] ?? "").trim() } : null;
};

/** Widen a part's range with a numeric reading. */
function recordReading(track: Track, reading: { label: string; value: string }) {
  const num = numberOf(reading.value);
  if (!num) return;
  track.min = Math.min(track.min, num.n);
  track.max = Math.max(track.max, num.n);
  track.unit = num.unit;
  track.readingLabel = reading.label;
}

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

  private trackOf(nodeId: string): Track {
    let track = this.tracks.get(nodeId);
    if (!track) {
      track = {
        on: false,
        firstOnLogged: false,
        toggles: 0,
        min: Infinity,
        max: -Infinity,
        unit: "",
        readingLabel: "",
      };
      this.tracks.set(nodeId, track);
    }
    return track;
  }

  /** " (Arduino Uno D13)": the board pin a part's signal is on, or nothing. */
  private boardPinText(node: LabNode, analysis: Analysis): string {
    const link = analysis.nodes[node.id]?.links.find((l) => !["vcc", "gnd"].includes(l.role));
    const board = link ? this.nodes.find((n) => n.id === link.board) : undefined;
    const boardPin =
      link && board
        ? getPinout(board.partId).pins.find((p) => p.id === link.boardPin)?.label
        : undefined;
    return board && boardPin ? ` (${board.label} ${boardPin})` : "";
  }

  /** Feed a frame; returns log lines for things that happened for the first time. */
  frame(frame: Frame, analysis: Analysis): Draft[] {
    this.lastT = frame.t;
    const drafts: Draft[] = [];
    for (const node of this.nodes) {
      const live = frame.nodes[node.id];
      if (!live || getPinout(node.partId).controller) continue;
      const track = this.trackOf(node.id);
      if (live.on !== track.on) {
        if (live.on) track.toggles += 1;
        track.on = live.on;
      }
      const reading = live.readings[0];
      if (reading) recordReading(track, reading);
      if (live.on && !track.firstOnLogged) {
        track.firstOnLogged = true;
        drafts.push({
          kind: "run",
          text: firstOnText(node, live.badge, reading?.value) + this.boardPinText(node, analysis),
          nodes: [node.id],
        });
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
        parts.push(
          `${node.label} ${track.readingLabel.toLowerCase()} ${fmt(track.min)}–${fmt(track.max)}${track.unit ? ` ${track.unit}` : ""}`,
        );
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

type FirstOn = (label: string, badge?: string, value?: string) => string;

const showsText: FirstOn = (label, _badge, value) => `${label} shows “${value ?? "text"}”`;
const comesUp: FirstOn = (label, badge, value) =>
  `${label} comes up: ${value ?? badge ?? "radio on"}`;

const FIRST_ON = new Map<string, FirstOn>([
  ["led", (label) => `${label} flashes on`],
  ["rgb-led", (label) => `${label} starts fading through colors`],
  ["buzzer", (label) => `${label} beeps`],
  ["relay", (label) => `${label} clicks: COM switches to NO`],
  ["servo", (label, badge) => `${label} moves to ${badge ?? "its angle"}`],
  ["dc-motor", (label, badge) => `${label} spins up${badge ? ` to ${badge}` : ""}`],
  ["stepper-motor", (label) => `${label} starts stepping`],
  ["pir", (label) => `${label} sees motion`],
  ["lcd-16x2", showsText],
  ["oled-ssd1306", showsText],
  ["tft-display", showsText],
  ["hc-05", comesUp],
  ["wifi-module", comesUp],
  ["nrf24l01", comesUp],
  ["lora", comesUp],
]);

function firstOnText(node: LabNode, badge?: string, value?: string): string {
  const text = FIRST_ON.get(node.partId);
  if (text) return text(node.label, badge, value);
  if (value) return `${node.label} reads ${value}`;
  return `${node.label} is ${badge?.toLowerCase() ?? "running"}`;
}
