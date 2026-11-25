/**
 * The `.kiungo.json` file: a lab session written out so it can be saved,
 * shared, made by another tool (an AI model through the Kiungo MCP server,
 * say) and opened again in the Engineering Lab.
 *
 *   { "format": "kiungo-lab-session", "version": 1, "session": { …LabSession } }
 *
 * Reading is strict about what the lab can draw and lenient about the rest:
 * parts the lab has no pinout for, wires to pins that don't exist and
 * duplicate wires are dropped with a warning rather than failing the file,
 * and the session gets a fresh id so opening the same file twice never
 * collides with a session already open. Pure: no browser APIs, so the MCP
 * server runs the same code.
 */

import { getPinout, hasPinout } from "./pinout";
import type { LabNode, LabSession, LabView, LabWire, LogEntry, LogKind, NodeInputs } from "./types";

const LOG_KINDS = new Set<LogKind>(["session", "build", "wire", "run", "state", "fault", "fix", "note"]);

export const SESSION_FILE_FORMAT = "kiungo-lab-session";
export const SESSION_FILE_VERSION = 1;
export const SESSION_FILE_EXTENSION = ".kiungo.json";

export interface SessionFile {
  format: typeof SESSION_FILE_FORMAT;
  version: typeof SESSION_FILE_VERSION;
  /** Who wrote the file: "Kiungo Engineering Lab", "Kiungo MCP server (Claude)". */
  generator?: string;
  session: LabSession;
}

export interface ParsedSessionFile {
  session: LabSession;
  warnings: string[];
}

export class SessionFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionFileError";
  }
}

const MAX_NODES = 200;
const MAX_WIRES = 1000;

/** The file a session is saved as. Runtime (backend mirror) ids are left out: they belong to one browser. */
export function toSessionFile(session: LabSession, generator?: string): SessionFile {
  const { runtime: _runtime, ...rest } = session;
  void _runtime;
  return { format: SESSION_FILE_FORMAT, version: SESSION_FILE_VERSION, ...(generator ? { generator } : {}), session: { ...rest, runtime: null } };
}

export function sessionFileName(session: Pick<LabSession, "name">): string {
  return `${session.name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "lab"}${SESSION_FILE_EXTENSION}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function freshId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/**
 * Read a `.kiungo.json` file (its text, or the parsed object). Throws
 * `SessionFileError` when it isn't a lab session at all; otherwise returns
 * the session the lab can open plus warnings for anything it dropped.
 */
export function parseSessionFile(input: string | unknown, opts: { keepId?: boolean } = {}): ParsedSessionFile {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new SessionFileError("This file isn't valid JSON.");
    }
  }
  if (!isObj(raw)) throw new SessionFileError("This file isn't a Kiungo lab session.");
  // Accept the wrapped file, or a bare session object.
  const wrapped = raw.format !== undefined || raw.session !== undefined;
  if (wrapped && raw.format !== SESSION_FILE_FORMAT) throw new SessionFileError(`Unknown file format “${String(raw.format)}”; expected “${SESSION_FILE_FORMAT}”.`);
  if (wrapped && typeof raw.version === "number" && raw.version > SESSION_FILE_VERSION) throw new SessionFileError(`This file is version ${raw.version}; this lab reads version ${SESSION_FILE_VERSION}. Update Kiungo to open it.`);
  const s = wrapped ? raw.session : raw;
  if (!isObj(s) || !Array.isArray(s.nodes)) throw new SessionFileError("This file has no lab session in it.");

  const warnings: string[] = [];
  const nodes: LabNode[] = [];
  const nodeIds = new Set<string>();
  for (const n of s.nodes.slice(0, MAX_NODES)) {
    if (!isObj(n) || typeof n.id !== "string" || typeof n.partId !== "string") {
      warnings.push("Skipped a part with no id or part type.");
      continue;
    }
    if (nodeIds.has(n.id)) {
      warnings.push(`Skipped a second part with id “${n.id}”.`);
      continue;
    }
    if (!hasPinout(n.partId)) {
      warnings.push(`Skipped “${str(n.label, n.partId)}”: the lab has no part “${n.partId}”.`);
      continue;
    }
    const mode = n.mode === "physical" || n.mode === "hybrid" ? n.mode : "virtual";
    nodes.push({ id: n.id, partId: n.partId, label: str(n.label, n.partId), x: Math.round(num(n.x, 80)), y: Math.round(num(n.y, 80)), mode });
    nodeIds.add(n.id);
  }
  if (s.nodes.length > MAX_NODES) warnings.push(`Only the first ${MAX_NODES} parts were opened.`);

  const partOf = new Map(nodes.map((n) => [n.id, n.partId]));
  const pinExists = (ref: unknown): ref is { node: string; pin: string } =>
    isObj(ref) && typeof ref.node === "string" && typeof ref.pin === "string" && partOf.has(ref.node) && getPinout(partOf.get(ref.node)!).pins.some((p) => p.id === ref.pin);

  const wires: LabWire[] = [];
  const seen = new Set<string>();
  const wireIds = new Set<string>();
  for (const w of (Array.isArray(s.wires) ? s.wires : []).slice(0, MAX_WIRES)) {
    if (!isObj(w) || !pinExists(w.from) || !pinExists(w.to)) {
      warnings.push(`Skipped a wire to a part or pin that isn't in the session${isObj(w) && typeof w.id === "string" ? ` (${w.id})` : ""}.`);
      continue;
    }
    const a = `${w.from.node}:${w.from.pin}`;
    const b = `${w.to.node}:${w.to.pin}`;
    if (a === b) {
      warnings.push("Skipped a wire from a pin to itself.");
      continue;
    }
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const id = typeof w.id === "string" && !wireIds.has(w.id) ? w.id : freshId("w");
    wireIds.add(id);
    wires.push({ id, from: { node: w.from.node, pin: w.from.pin }, to: { node: w.to.node, pin: w.to.pin }, ...(typeof w.color === "string" ? { color: w.color } : {}) });
  }

  const inputs: Record<string, NodeInputs> = {};
  if (isObj(s.inputs)) {
    for (const [id, values] of Object.entries(s.inputs)) {
      if (!nodeIds.has(id) || !isObj(values)) continue;
      const clean: NodeInputs = {};
      for (const [k, v] of Object.entries(values)) if (typeof v === "number" ? Number.isFinite(v) : typeof v === "string" || typeof v === "boolean") clean[k] = v as number | string | boolean;
      inputs[id] = clean;
    }
  }

  const log: LogEntry[] = (Array.isArray(s.log) ? s.log : [])
    .filter((e): e is LogEntry => isObj(e) && typeof e.text === "string" && typeof e.kind === "string" && LOG_KINDS.has(e.kind as LogKind))
    .slice(-400)
    .map((e) => ({ id: str(e.id, freshId("log")), at: str(e.at, new Date().toISOString()), kind: e.kind, text: e.text, ...(Array.isArray(e.nodes) ? { nodes: e.nodes.filter((x) => typeof x === "string" && nodeIds.has(x)) } : {}) }));

  const now = new Date().toISOString();
  const session: LabSession = {
    id: opts.keepId && typeof s.id === "string" ? s.id : freshId("lab"),
    name: str(s.name, "Imported lab"),
    projectId: null,
    createdAt: str(s.createdAt, now),
    updatedAt: now,
    nodes,
    wires,
    log,
    view: (s.view === "reality" || s.view === "flow" ? s.view : "top") as LabView,
    runMs: Math.max(0, num(s.runMs, 0)),
    inputs,
    runtime: null,
  };
  return { session, warnings };
}
