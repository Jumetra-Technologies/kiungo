/**
 * A Kiungo 2 project is a folder in an open format (PRJ-01, DSK-12):
 *
 *   My robot/
 *     kiungo.json          the project: name, board, when it was made
 *     circuit.json         the lab build (the `.kiungo.json` session format)
 *     sketch/
 *       sketch.ino         the code
 *       sketch.yaml        Arduino CLI build profile: board and pinned versions
 *     records/             experiment records (PRJ-02, later)
 *     .kiungo/history.json undo and redo, so they survive a restart (DSK-13)
 *
 * The sketch folder has a fixed name, so renaming a project never renames its
 * code (Arduino needs the main file named after its folder). Everything here
 * is pure: the desktop app's main process reads and writes the files.
 */

import { getPart } from "../parts";
import { parseSessionFile, SessionFileError, toSessionFile, type SessionFile } from "../lab/session-file";
import type { LabSession, LabWire, LabNode } from "../lab/types";

export const PROJECT_FILE = "kiungo.json";
export const CIRCUIT_FILE = "circuit.json";
export const SKETCH_DIR = "sketch";
export const SKETCH_FILE = "sketch.ino";
export const SKETCH_PROFILE_FILE = "sketch.yaml";
export const RECORDS_DIR = "records";
export const STATE_DIR = ".kiungo";
export const HISTORY_FILE = "history.json";

export const PROJECT_FORMAT = "kiungo-project";
export const PROJECT_VERSION = 1;

/** `kiungo.json`. */
export interface ProjectMeta {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  /** The board the code is written for: a lab part id ("arduino-uno"). */
  board: string;
  /** The starter it was made from, or null for a blank project. */
  starter: string | null;
  createdAt: string;
  updatedAt: string;
  /** The app that last wrote it: "Kiungo 0.3.0". */
  generator?: string;
  /** What it was imported from (DSK-15), so a second import can say it's a copy. */
  importedFrom?: { kind: ImportKind; id: string };
}

export type ImportKind = "lab-session" | "phase-one-project" | "session-file";

/** A board a project can be written for, and how Arduino CLI builds for it. */
export interface ProjectBoard {
  /** The lab part. */
  part: string;
  name: string;
  fqbn: string;
  /** The board package, pinned so a project builds the same on every computer; `indexUrl` for a package outside Arduino's own index. */
  platform: { id: string; version: string; indexUrl?: string };
}

/**
 * Boards a new project can target, each with its board package pinned. A Uno
 * project also uploads to a Nano (same chip); see `@kiungo/core/hardware/boards`.
 */
export const PROJECT_BOARDS: readonly ProjectBoard[] = [
  { part: "arduino-uno", name: "Arduino Uno", fqbn: "arduino:avr:uno", platform: { id: "arduino:avr", version: "1.8.6" } },
  { part: "arduino-mega", name: "Arduino Mega 2560", fqbn: "arduino:avr:mega:cpu=atmega2560", platform: { id: "arduino:avr", version: "1.8.6" } },
  {
    part: "esp32",
    name: "ESP32 Dev Module",
    fqbn: "esp32:esp32:esp32",
    platform: { id: "esp32:esp32", version: "3.3.12", indexUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json" },
  },
];

export function projectBoard(part: string): ProjectBoard | undefined {
  return PROJECT_BOARDS.find((b) => b.part === part);
}

/** An Arduino library pinned in the build profile: "Servo (1.3.0)". */
export interface PinnedLibrary {
  name: string;
  version: string;
  /** Needed by another library, not by the sketch: Arduino CLI removes it with the library that needs it. */
  dependency?: boolean;
}

/** `sketch/sketch.yaml`: one profile, the default, so a plain compile uses it. */
export function sketchProfile(board: ProjectBoard, libraries: readonly PinnedLibrary[] = []): string {
  const lines = [
    "# Written by Kiungo: the board and the exact versions this sketch builds with.",
    "# Arduino CLI downloads anything missing the first time it compiles.",
    "profiles:",
    "  kiungo:",
    `    fqbn: ${board.fqbn}`,
    "    platforms:",
    `      - platform: ${board.platform.id} (${board.platform.version})`,
    ...(board.platform.indexUrl ? [`        platform_index_url: ${board.platform.indexUrl}`] : []),
  ];
  if (libraries.length) {
    lines.push("    libraries:");
    for (const lib of libraries) lines.push(`      - ${lib.dependency ? "dependency: " : ""}${lib.name} (${lib.version})`);
  }
  lines.push("default_profile: kiungo", "");
  return lines.join("\n");
}

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const iso = (v: unknown, fallback: string) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);

/** Read `kiungo.json`. Throws `ProjectFileError` when it isn't a Kiungo project. */
export function parseProjectMeta(input: string): ProjectMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    throw new ProjectFileError("The project file (kiungo.json) is damaged: it isn't valid JSON.");
  }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) throw new ProjectFileError("This folder's kiungo.json isn't a Kiungo project.");
  if (typeof raw.version === "number" && raw.version > PROJECT_VERSION) throw new ProjectFileError(`This project was saved by a newer Kiungo (format ${raw.version}). Update Kiungo to open it.`);
  const now = new Date().toISOString();
  const createdAt = iso(raw.createdAt, now);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: text(raw.id, `prj-${Date.parse(createdAt).toString(36)}`),
    name: text(raw.name, "Untitled project"),
    board: text(raw.board, "arduino-uno"),
    starter: typeof raw.starter === "string" ? raw.starter : null,
    createdAt,
    updatedAt: iso(raw.updatedAt, createdAt),
    ...(typeof raw.generator === "string" ? { generator: raw.generator } : {}),
    ...(isObj(raw.importedFrom) && ["lab-session", "phase-one-project", "session-file"].includes(raw.importedFrom.kind as string) && typeof raw.importedFrom.id === "string"
      ? { importedFrom: { kind: raw.importedFrom.kind as ImportKind, id: raw.importedFrom.id.slice(0, 120) } }
      : {}),
  };
}

export function serializeProjectMeta(meta: ProjectMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

/** `circuit.json` is the lab session file, so a build opens in the website's lab too. */
export function serializeCircuit(session: LabSession, generator: string): string {
  return `${JSON.stringify(toSessionFile(session, generator), null, 2)}\n`;
}

/** Read `circuit.json`, keeping ids so undo history still matches. */
export function parseCircuit(input: string): { session: LabSession; warnings: string[] } {
  try {
    return parseSessionFile(input, { keepId: true });
  } catch (error) {
    if (error instanceof SessionFileError) throw new ProjectFileError(`The circuit file (circuit.json) can't be read: ${error.message}`);
    throw error;
  }
}

export type { SessionFile };

/** `.kiungo/history.json`: the undo and redo stacks of the open circuit. */
export interface HistoryFile {
  version: 1;
  past: Array<{ nodes: LabNode[]; wires: LabWire[] }>;
  future: Array<{ nodes: LabNode[]; wires: LabWire[] }>;
}

/** Read the history, or null if it's missing or unreadable: history is a convenience, never a reason to refuse a project. */
export function parseHistory(input: string): HistoryFile | null {
  try {
    const raw: unknown = JSON.parse(input);
    if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.past) || !Array.isArray(raw.future)) return null;
    const ok = (s: unknown): s is { nodes: LabNode[]; wires: LabWire[] } => isObj(s) && Array.isArray(s.nodes) && Array.isArray(s.wires);
    return { version: 1, past: raw.past.filter(ok), future: raw.future.filter(ok) };
  } catch {
    return null;
  }
}

/** A folder name for a project: the name, minus characters Windows, macOS or Linux refuse. */
export function folderNameFor(name: string): string {
  const clean = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
  const base = clean && !reserved.test(clean) ? clean : "Kiungo project";
  return base.slice(0, 80);
}

/** The board's display name for Home: "Arduino Uno". */
export function boardName(part: string): string {
  return projectBoard(part)?.name ?? getPart(part)?.name ?? part;
}
