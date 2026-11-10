/**
 * The lab terminal: a small command language for building and checking a
 * circuit by typing. Pure apart from the actions it is given, so it can be
 * tested without a browser.
 */

import { getPart, searchParts } from "../parts";
import type { Analysis } from "./circuit";
import { getPinout } from "./pinout";
import type { Frame } from "./simulate";
import type { LabNode, LabSession, LabView, LabWire, PinRef } from "./types";

export type LineKind = "in" | "out" | "ok" | "err" | "muted";
export interface TermLine {
  kind: LineKind;
  text: string;
}

export interface TerminalApi {
  session: LabSession;
  analysis: Analysis;
  frame: Frame;
  running: boolean;
  addPart: (partId: string, autowire: boolean) => LabNode | null;
  removeNodes: (ids: string[]) => void;
  addWire: (from: PinRef, to: PinRef) => LabWire | null;
  autowire: (id: string) => number;
  unwire: (id: string) => number;
  run: () => void;
  stop: () => void;
  step: () => void;
  reset: () => void;
  setView: (v: LabView) => void;
  clear: () => void;
}

export const HELP: Array<[string, string]> = [
  ["add <part> [--no-wire]", "Add a part, auto-wired to the board (add led, add temperature)"],
  ["rm <part>", "Remove a part"],
  ["wire <part>.<pin> <part>.<pin>", "Wire two pins (wire uno.D13 led.A)"],
  ["autowire <part>", "Wire a part to the board"],
  ["unwire <part>", "Remove every wire on a part"],
  ["ls", "List parts and their status"],
  ["pins <part>", "Show a part's pins and what they connect to"],
  ["read <part>", "Show a part's live readings"],
  ["faults", "List problems in the circuit"],
  ["run · stop · step · reset", "Control the simulation"],
  ["view 3d|top|flow", "Switch the canvas view"],
  ["log [n]", "Show the last n activity entries"],
  ["clear", "Clear the terminal"],
];

/** Split on spaces, keeping "quoted words" together. */
export function tokenize(input: string): string[] {
  return (input.match(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g) ?? []).map((t) => t.replace(/["']/g, ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

export function findNode(nodes: LabNode[], query: string): LabNode | undefined {
  const q = norm(query);
  return (
    nodes.find((n) => norm(n.label) === q) ??
    nodes.find((n) => n.partId === query.toLowerCase()) ??
    nodes.find((n) => norm(n.label).startsWith(q)) ??
    nodes.find((n) => norm(n.label).includes(q)) ??
    nodes.find((n) => n.partId.includes(query.toLowerCase()))
  );
}

function findPin(node: LabNode, query: string) {
  const pins = getPinout(node.partId).pins;
  const q = norm(query);
  return (
    pins.find((p) => norm(p.id) === q) ??
    pins.find((p) => norm(p.label) === q) ??
    pins.find((p) => norm(p.label).startsWith(q))
  );
}

/** "uno.D13" or "\"Arduino Uno\".D13" */
function parseRef(nodes: LabNode[], token: string): { ref?: PinRef; error?: string } {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { error: `Use part.pin, for example uno.D13 (got “${token}”)` };
  const node = findNode(nodes, token.slice(0, dot));
  if (!node) return { error: `No part called “${token.slice(0, dot)}” on the canvas` };
  const pin = findPin(node, token.slice(dot + 1));
  if (!pin)
    return {
      error: `${node.label} has no pin “${token.slice(dot + 1)}”. Try: pins ${(node.label.split(" ")[0] ?? "").toLowerCase()}`,
    };
  return { ref: { node: node.id, pin: pin.id } };
}

/** What a command gets: its arguments, the lab, and where to write its output. */
interface Term {
  args: string[];
  api: TerminalApi;
  nodes: LabNode[];
  ok: (text: string) => void;
  err: (text: string) => void;
  line: (text: string, kind?: LineKind) => void;
}

/** The part named by the arguments, or an error line and null. */
function namedNode(t: Term): LabNode | null {
  const node = findNode(t.nodes, t.args.join(" "));
  if (!node) t.err(`No part called “${t.args.join(" ")}”`);
  return node ?? null;
}

function help(t: Term) {
  for (const [syntax, what] of HELP) t.line(`${syntax.padEnd(32)} ${what}`);
}

function add(t: Term) {
  const { args, api, ok, err } = t;
  const noWire = args.includes("--no-wire");
  const query = args.filter((a) => a !== "--no-wire").join(" ");
  if (!query) {
    err("Usage: add <part>, for example add dht22");
    return;
  }
  const part = getPart(query.toLowerCase()) ?? searchParts(query)[0];
  if (!part) {
    err(`No part matches “${query}”`);
    return;
  }
  const node = api.addPart(part.id, !noWire);
  if (node)
    ok(
      `Added ${node.label}${!noWire && !getPinout(part.id).controller ? " and wired it to the board" : ""}`,
    );
  else err("Couldn't add the part");
}

function remove(t: Term) {
  const node = namedNode(t);
  if (!node) return;
  t.api.removeNodes([node.id]);
  t.ok(`Removed ${node.label}`);
}

function wire(t: Term) {
  const { args, nodes, api, ok, err } = t;
  if (args.length < 2) {
    err("Usage: wire <part>.<pin> <part>.<pin>");
    return;
  }
  const a = parseRef(nodes, args[0] ?? "");
  const b = parseRef(nodes, args[1] ?? "");
  if (a.error || b.error) {
    err(a.error ?? b.error!);
    return;
  }
  const made = api.addWire(a.ref!, b.ref!);
  if (made) ok(`Wired ${args[0]} → ${args[1]}`);
  else err("Those pins are already wired");
}

function autowire(t: Term) {
  const node = namedNode(t);
  if (!node) return;
  const n = t.api.autowire(node.id);
  if (n) t.ok(`Wired ${node.label} with ${n} wire${n === 1 ? "" : "s"}`);
  else
    t.err(
      getPinout(node.partId).controller
        ? "Boards don't auto-wire; wire parts to them"
        : `Nothing to wire on ${node.label}: add a board, or it's already connected`,
    );
}

function unwire(t: Term) {
  const node = namedNode(t);
  if (!node) return;
  const n = t.api.unwire(node.id);
  t.ok(`Removed ${n} wire${n === 1 ? "" : "s"} from ${node.label}`);
}

function list(t: Term) {
  const { nodes, api, line } = t;
  if (!nodes.length) {
    line("Nothing on the canvas yet. Try: add uno", "muted");
    return;
  }
  for (const n of nodes) {
    const r = api.analysis.nodes[n.id];
    line(
      `${n.label.padEnd(22)} ${(r?.status ?? "idle").padEnd(10)} ${api.frame.nodes[n.id]?.badge ?? ""}`,
    );
  }
}

/** The other ends of the wires on one pin, as "Label.pin". */
function pinEnds(t: Term, node: LabNode, pinId: string): string[] {
  const here = (end: PinRef) => end.node === node.id && end.pin === pinId;
  return t.api.session.wires
    .filter((w) => here(w.from) || here(w.to))
    .map((w) => {
      const end = here(w.from) ? w.to : w.from;
      const other = t.nodes.find((x) => x.id === end.node);
      return `${other?.label ?? "?"}.${end.pin}`;
    });
}

function pins(t: Term) {
  const node = namedNode(t);
  if (!node) return;
  for (const pin of getPinout(node.partId).pins) {
    const ends = pinEnds(t, node, pin.id);
    const where = ends.length ? ends.join(", ") : pin.required ? "(needs a wire)" : "—";
    t.line(`${pin.label.padEnd(16)} ${where}`, ends.length ? "out" : "muted");
  }
}

function read(t: Term) {
  const node = namedNode(t);
  if (!node) return;
  const { api, line } = t;
  const live = api.frame.nodes[node.id];
  if (!live?.readings.length)
    line(
      api.running ? `${node.label} has nothing to report` : "Not running. Type run first.",
      "muted",
    );
  for (const r of live?.readings ?? []) line(`${r.label.padEnd(14)} ${r.value}`);
}

const SEVERITY_LINE: Record<string, LineKind> = { error: "err", warning: "out" };

function faults(t: Term) {
  const { api, ok, line } = t;
  if (!api.analysis.faults.length) ok("No problems found");
  for (const f of api.analysis.faults)
    line(
      `${f.severity.toUpperCase().padEnd(8)} ${f.title}: ${f.detail}`,
      SEVERITY_LINE[f.severity] ?? "muted",
    );
}

function status(t: Term) {
  const { api, nodes, line } = t;
  const counts = Object.values(api.analysis.nodes).reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {},
  );
  line(
    `${api.session.name}: ${nodes.length} parts, ${api.session.wires.length} wires, ${api.running ? `running (${api.frame.t.toFixed(1)} s)` : "stopped"}`,
  );
  line(
    Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(" · ") || "empty",
    "muted",
  );
}

const VIEWS: Record<string, LabView> = {
  "3d": "reality",
  model: "reality",
  reality: "reality",
  top: "top",
  plan: "top",
  flow: "flow",
  current: "flow",
};

function view(t: Term) {
  const v = (t.args[0] ?? "").toLowerCase();
  if (!VIEWS[v]) {
    t.err("Usage: view 3d | top | flow");
    return;
  }
  t.api.setView(VIEWS[v]);
  t.ok(`View: ${v}`);
}

function log(t: Term) {
  const n = Math.max(1, Math.min(50, Number(t.args[0]) || 10));
  for (const e of t.api.session.log.slice(-n))
    t.line(`${new Date(e.at).toLocaleTimeString()}  ${e.text}`, e.kind === "fault" ? "err" : "out");
}

const COMMANDS = new Map<string, (t: Term) => void>([
  ["help", help],
  ["?", help],
  ["add", add],
  ["rm", remove],
  ["remove", remove],
  ["delete", remove],
  ["wire", wire],
  ["autowire", autowire],
  ["unwire", unwire],
  ["ls", list],
  ["parts", list],
  ["pins", pins],
  ["read", read],
  ["faults", faults],
  ["problems", faults],
  ["status", status],
  [
    "run",
    (t) => {
      t.api.run();
      t.ok("Running the default sketch: blink outputs, read sensors");
    },
  ],
  [
    "start",
    (t) => {
      t.api.run();
      t.ok("Running the default sketch: blink outputs, read sensors");
    },
  ],
  [
    "stop",
    (t) => {
      t.api.stop();
      t.ok("Stopped");
    },
  ],
  [
    "pause",
    (t) => {
      t.api.stop();
      t.ok("Stopped");
    },
  ],
  [
    "step",
    (t) => {
      t.api.step();
      t.ok("Stepped 100 ms");
    },
  ],
  [
    "reset",
    (t) => {
      t.api.reset();
      t.ok("Reset to 0 s");
    },
  ],
  ["view", view],
  ["log", log],
  ["clear", (t) => t.api.clear()],
  ["cls", (t) => t.api.clear()],
]);

export function runCommand(input: string, api: TerminalApi): TermLine[] {
  const tokens = tokenize(input.trim());
  if (!tokens.length) return [];
  const [cmd = "", ...args] = tokens;
  const out: TermLine[] = [];
  const term: Term = {
    args,
    api,
    nodes: api.session.nodes,
    ok: (text) => out.push({ kind: "ok", text }),
    err: (text) => out.push({ kind: "err", text }),
    line: (text, kind = "out") => out.push({ kind, text }),
  };
  const command = COMMANDS.get(cmd.toLowerCase());
  if (command) command(term);
  else term.err(`Unknown command “${cmd}”. Type help for the list.`);
  return out;
}
