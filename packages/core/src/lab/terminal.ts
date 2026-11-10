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
  return pins.find((p) => norm(p.id) === q) ?? pins.find((p) => norm(p.label) === q) ?? pins.find((p) => norm(p.label).startsWith(q));
}

/** "uno.D13" or "\"Arduino Uno\".D13" */
function parseRef(nodes: LabNode[], token: string): { ref?: PinRef; error?: string } {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { error: `Use part.pin, for example uno.D13 (got “${token}”)` };
  const node = findNode(nodes, token.slice(0, dot));
  if (!node) return { error: `No part called “${token.slice(0, dot)}” on the canvas` };
  const pin = findPin(node, token.slice(dot + 1));
  if (!pin) return { error: `${node.label} has no pin “${token.slice(dot + 1)}”. Try: pins ${node.label.split(" ")[0].toLowerCase()}` };
  return { ref: { node: node.id, pin: pin.id } };
}

export function runCommand(input: string, api: TerminalApi): TermLine[] {
  const tokens = tokenize(input.trim());
  if (!tokens.length) return [];
  const [cmd, ...args] = tokens;
  const nodes = api.session.nodes;
  const out: TermLine[] = [];
  const ok = (text: string) => out.push({ kind: "ok", text });
  const err = (text: string) => out.push({ kind: "err", text });
  const line = (text: string, kind: LineKind = "out") => out.push({ kind, text });

  switch (cmd.toLowerCase()) {
    case "help":
    case "?":
      for (const [syntax, what] of HELP) line(`${syntax.padEnd(32)} ${what}`);
      break;
    case "add": {
      const noWire = args.includes("--no-wire");
      const query = args.filter((a) => a !== "--no-wire").join(" ");
      if (!query) {
        err("Usage: add <part>, for example add dht22");
        break;
      }
      const part = getPart(query.toLowerCase()) ?? searchParts(query)[0];
      if (!part) {
        err(`No part matches “${query}”`);
        break;
      }
      const node = api.addPart(part.id, !noWire);
      if (node) ok(`Added ${node.label}${!noWire && !getPinout(part.id).controller ? " and wired it to the board" : ""}`);
      else err("Couldn't add the part");
      break;
    }
    case "rm":
    case "remove":
    case "delete": {
      const node = findNode(nodes, args.join(" "));
      if (!node) {
        err(`No part called “${args.join(" ")}”`);
        break;
      }
      api.removeNodes([node.id]);
      ok(`Removed ${node.label}`);
      break;
    }
    case "wire": {
      if (args.length < 2) {
        err("Usage: wire <part>.<pin> <part>.<pin>");
        break;
      }
      const a = parseRef(nodes, args[0]);
      const b = parseRef(nodes, args[1]);
      if (a.error || b.error) {
        err(a.error ?? b.error!);
        break;
      }
      const wire = api.addWire(a.ref!, b.ref!);
      if (wire) ok(`Wired ${args[0]} → ${args[1]}`);
      else err("Those pins are already wired");
      break;
    }
    case "autowire": {
      const node = findNode(nodes, args.join(" "));
      if (!node) {
        err(`No part called “${args.join(" ")}”`);
        break;
      }
      const n = api.autowire(node.id);
      if (n) ok(`Wired ${node.label} with ${n} wire${n === 1 ? "" : "s"}`);
      else err(getPinout(node.partId).controller ? "Boards don't auto-wire; wire parts to them" : `Nothing to wire on ${node.label}: add a board, or it's already connected`);
      break;
    }
    case "unwire": {
      const node = findNode(nodes, args.join(" "));
      if (!node) {
        err(`No part called “${args.join(" ")}”`);
        break;
      }
      const n = api.unwire(node.id);
      ok(`Removed ${n} wire${n === 1 ? "" : "s"} from ${node.label}`);
      break;
    }
    case "ls":
    case "parts": {
      if (!nodes.length) {
        line("Nothing on the canvas yet. Try: add uno", "muted");
        break;
      }
      for (const n of nodes) {
        const r = api.analysis.nodes[n.id];
        line(`${n.label.padEnd(22)} ${(r?.status ?? "idle").padEnd(10)} ${api.frame.nodes[n.id]?.badge ?? ""}`);
      }
      break;
    }
    case "pins": {
      const node = findNode(nodes, args.join(" "));
      if (!node) {
        err(`No part called “${args.join(" ")}”`);
        break;
      }
      const wires = api.session.wires;
      for (const pin of getPinout(node.partId).pins) {
        const ends = wires
          .filter((w) => (w.from.node === node.id && w.from.pin === pin.id) || (w.to.node === node.id && w.to.pin === pin.id))
          .map((w) => {
            const end = w.from.node === node.id && w.from.pin === pin.id ? w.to : w.from;
            const other = nodes.find((x) => x.id === end.node);
            return `${other?.label ?? "?"}.${end.pin}`;
          });
        line(`${pin.label.padEnd(16)} ${ends.length ? ends.join(", ") : pin.required ? "(needs a wire)" : "—"}`, ends.length ? "out" : "muted");
      }
      break;
    }
    case "read": {
      const node = findNode(nodes, args.join(" "));
      if (!node) {
        err(`No part called “${args.join(" ")}”`);
        break;
      }
      const live = api.frame.nodes[node.id];
      if (!live?.readings.length) line(api.running ? `${node.label} has nothing to report` : "Not running. Type run first.", "muted");
      for (const r of live?.readings ?? []) line(`${r.label.padEnd(14)} ${r.value}`);
      break;
    }
    case "faults":
    case "problems": {
      if (!api.analysis.faults.length) ok("No problems found");
      for (const f of api.analysis.faults) line(`${f.severity.toUpperCase().padEnd(8)} ${f.title}: ${f.detail}`, f.severity === "error" ? "err" : f.severity === "warning" ? "out" : "muted");
      break;
    }
    case "status": {
      const counts = Object.values(api.analysis.nodes).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
      line(`${api.session.name}: ${nodes.length} parts, ${api.session.wires.length} wires, ${api.running ? `running (${api.frame.t.toFixed(1)} s)` : "stopped"}`);
      line(Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ") || "empty", "muted");
      break;
    }
    case "run":
    case "start":
      api.run();
      ok("Running the default sketch: blink outputs, read sensors");
      break;
    case "stop":
    case "pause":
      api.stop();
      ok("Stopped");
      break;
    case "step":
      api.step();
      ok("Stepped 100 ms");
      break;
    case "reset":
      api.reset();
      ok("Reset to 0 s");
      break;
    case "view": {
      const v = (args[0] ?? "").toLowerCase();
      const map: Record<string, LabView> = { "3d": "reality", model: "reality", reality: "reality", top: "top", plan: "top", flow: "flow", current: "flow" };
      if (!map[v]) {
        err("Usage: view 3d | top | flow");
        break;
      }
      api.setView(map[v]);
      ok(`View: ${v}`);
      break;
    }
    case "log": {
      const n = Math.max(1, Math.min(50, Number(args[0]) || 10));
      for (const e of api.session.log.slice(-n)) line(`${new Date(e.at).toLocaleTimeString()}  ${e.text}`, e.kind === "fault" ? "err" : "out");
      break;
    }
    case "clear":
    case "cls":
      api.clear();
      break;
    default:
      err(`Unknown command “${cmd}”. Type help for the list.`);
  }
  return out;
}
