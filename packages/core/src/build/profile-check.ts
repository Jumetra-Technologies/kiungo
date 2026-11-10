/**
 * Whether a project's build settings (sketch/sketch.yaml) are safe to build
 * with, before Arduino CLI reads them.
 *
 * A build profile decides what runs on the computer during a build: a board
 * package's recipes are commands, and a library's settings reach the
 * compiler and linker. A project can come from anyone (a classmate, a USB
 * stick, an account), so a profile may only name what Kiungo itself writes:
 * one of Kiungo's boards, the board packages those come from, and libraries
 * from the Arduino library index by name and version. Anything else, or any
 * YAML this can't read the same way Arduino CLI would, is refused rather
 * than guessed at.
 */

import { HARDWARE_BOARDS } from "../hardware/boards";
import { PROJECT_BOARDS } from "../project/format";
import type { ProfileLibrary } from "./libraries";

export interface ProfileCheckOptions {
  /**
   * Whether `dir:` libraries may appear (Kiungo's own Hybrid copy). The caller
   * checks each folder is one of Kiungo's own; a project's profile never has one.
   */
  allowDirs?: boolean;
}

export type ProfileCheck =
  | { ok: true; fqbn: string; libraries: ProfileLibrary[]; dirs: string[] }
  | { ok: false; message: string };

/** Board packages Kiungo builds with, and the only index each may come from. */
const KNOWN_PLATFORMS: ReadonlyMap<string, string | null> = (() => {
  const map = new Map<string, string | null>();
  for (const b of [...PROJECT_BOARDS, ...HARDWARE_BOARDS])
    map.set(b.platform.id, b.platform.indexUrl ?? null);
  return map;
})();
const KNOWN_FQBNS: ReadonlySet<string> = new Set(
  [...PROJECT_BOARDS, ...HARDWARE_BOARDS].map((b) => b.fqbn),
);

const PROFILE_NAME = /^[A-Za-z0-9_][\w.-]{0,63}$/;
const VERSION = /^\d{1,4}(?:\.\d{1,4}){0,2}(?:[-+][0-9A-Za-z.]{1,32})?$/;
const PLATFORM = /^([A-Za-z0-9_.-]{1,64}:[A-Za-z0-9_.-]{1,64})(?: \(([^()\s]+)\))?$/;
/** The Arduino library registry's naming rule: a letter or number, then letters, numbers, spaces, _ . and -. */
const LIBRARY = /^([A-Za-z0-9][A-Za-z0-9 _.-]{0,62}?) \(([^()\s]+)\)$/;

const refuse = (message: string): ProfileCheck => ({
  ok: false,
  message: `Kiungo won't build this project: its build settings (sketch/sketch.yaml) ${message}. Kiungo only builds with its own boards and with libraries from the Arduino library index. If you didn't change sketch.yaml yourself, don't build this project.`,
});

interface Profile {
  name: string;
  fqbn: string | null;
  platforms: Array<{ id: string; version: string | null; url: string | null }>;
  libraries: ProfileLibrary[];
  dirs: string[];
  keys: Set<string>;
}

/** A `dir:` value: plain, or a JSON string (how Kiungo writes the Hybrid copy's). */
function dirValue(raw: string): string | null {
  if (raw.startsWith('"')) {
    try {
      const v: unknown = JSON.parse(raw);
      return typeof v === "string" && v ? v : null;
    } catch {
      return null;
    }
  }
  return /^[^\s'"&*!|>%@`{}[\]#?,-][^'"#]*$/.test(raw) ? raw.trimEnd() : null;
}

/** Strip a trailing comment: in YAML a # starts one only after a space, and never inside a double-quoted string. */
function uncomment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === "\\") i++;
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === "#" && i > 0 && /\s/.test(line[i - 1] ?? ""))
      return line.slice(0, i).trimEnd();
  }
  return line;
}

/** Where the reader is in the file: what it has seen, and the indents that place the next line. */
interface Reader {
  profiles: Map<string, Profile>;
  sawProfiles: boolean;
  sawDefault: boolean;
  inProfiles: boolean;
  profileIndent: number;
  keyIndent: number;
  itemIndent: number;
  current: Profile | null;
  section: "platforms" | "libraries" | null;
}

/** Why a line is refused (the end of "its build settings … "), or null to read on. */
type Step = string | null;

const layout = (at: string) => `aren't laid out the way Kiungo writes them ${at}`;

/** A line's indent and text, or why its shape is refused before its meaning is read. */
function lineShape(raw: string, i: number): { indent: number; body: string; at: string } | string {
  const line = uncomment(raw);
  // Kiungo writes whole-line comments only: text after a setting is refused, not cut off.
  if (line.trimEnd() !== raw.trimEnd()) return `have a comment after a setting (line ${i + 1})`;
  const indent = line.length - line.trimStart().length;
  const body = line.trim();
  const at = `(line ${i + 1})`;
  // Characters that change what YAML means (anchors, aliases, tags, flow and block styles, documents).
  if (
    /^(---|\.\.\.)/.test(body) ||
    /(^|[\s:])[&*!|>[\]{}]/.test(body.replace(/"(?:[^"\\]|\\.)*"/g, '""')) ||
    body.startsWith("? ") ||
    body.includes("<<")
  ) {
    return `contain YAML Kiungo doesn't write ${at}`;
  }
  return { indent, body, at };
}

/** `profiles:` or `default_profile:`, the only two settings at the top. */
function topLevel(r: Reader, body: string, at: string): Step {
  r.inProfiles = false;
  r.current = null;
  r.section = null;
  if (body === "profiles:") {
    if (r.sawProfiles) return `list profiles twice ${at}`;
    r.sawProfiles = r.inProfiles = true;
    return null;
  }
  const def = /^default_profile: (\S+)$/.exec(body);
  if (def && PROFILE_NAME.test(def[1] ?? "") && !r.sawDefault) {
    r.sawDefault = true;
    return null;
  }
  return `contain a setting Kiungo doesn't use ${at}`;
}

/** A profile's name. */
function profileName(r: Reader, body: string, indent: number, at: string): Step {
  const name = /^([^\s:]+):$/.exec(body)?.[1];
  if (!name || !PROFILE_NAME.test(name)) return `name a profile Kiungo can't read ${at}`;
  if (r.profiles.has(name)) return `list the profile "${name}" twice ${at}`;
  r.profileIndent = indent;
  r.keyIndent = -1;
  r.itemIndent = -1;
  r.section = null;
  r.current = { name, fqbn: null, platforms: [], libraries: [], dirs: [], keys: new Set() };
  r.profiles.set(name, r.current);
  return null;
}

/** A profile's own settings: fqbn, platforms, libraries. */
function profileKey(r: Reader, current: Profile, body: string, indent: number, at: string): Step {
  const kv = /^([a-z_]+):(?: (.*))?$/.exec(body);
  if (!kv) return layout(at);
  const [, key = "", value = ""] = kv;
  if (current.keys.has(key)) return `set "${key}" twice ${at}`;
  current.keys.add(key);
  r.keyIndent = indent;
  r.itemIndent = -1;
  r.section = null;
  if (key === "fqbn" && value) {
    current.fqbn = value.trim();
    return null;
  }
  if ((key === "platforms" || key === "libraries") && !value) {
    r.section = key;
    return null;
  }
  return `contain a setting Kiungo doesn't use, "${key}" ${at}`;
}

/** A board package, or the index URL under the one before it. */
function platformLine(r: Reader, current: Profile, body: string, indent: number, at: string): Step {
  if (r.itemIndent < 0 || indent === r.itemIndent) {
    const m = /^- platform: (.+)$/.exec(body);
    const p = m ? PLATFORM.exec((m[1] ?? "").trim()) : null;
    if (!p) return `name a board package Kiungo can't read ${at}`;
    const [, id = "", version] = p;
    if (version && !VERSION.test(version))
      return `give the board package ${id} a version Kiungo can't read ${at}`;
    r.itemIndent = indent;
    current.platforms.push({ id, version: version ?? null, url: null });
    return null;
  }
  const last = current.platforms.at(-1);
  const url = /^platform_index_url: (\S+)$/.exec(body)?.[1];
  if (indent !== r.itemIndent + 2 || !last || last.url !== null || !url) return layout(at);
  last.url = url;
  return null;
}

function libraryFolder(current: Profile, value: string, at: string): Step {
  const path = dirValue(value);
  if (!path) return `name a library folder Kiungo can't read ${at}`;
  current.dirs.push(path);
  return null;
}

/** A library: from the index by name and version, or (Kiungo's own) from a folder. */
function libraryLine(r: Reader, current: Profile, body: string, indent: number, at: string): Step {
  if (r.itemIndent >= 0 && indent !== r.itemIndent) return layout(at);
  r.itemIndent = indent;
  const item = /^- (.+)$/.exec(body)?.[1]?.trim();
  if (!item) return layout(at);
  const dir = /^dir: (.+)$/.exec(item);
  if (dir) return libraryFolder(current, (dir[1] ?? "").trim(), at);
  const dep = /^dependency: (.+)$/.exec(item);
  const lib = LIBRARY.exec((dep?.[1] ?? item).trim());
  const [, name = "", version = ""] = lib ?? [];
  if (!lib || !VERSION.test(version)) return `name a library Kiungo can't read ${at}`;
  current.libraries.push({ name: name.trim(), version, dependency: Boolean(dep) });
  return null;
}

/** One line, placed by its indent: the top, a profile's name, its settings, or an item of a section. */
function readLine(r: Reader, indent: number, body: string, at: string): Step {
  if (indent === 0) return topLevel(r, body, at);
  if (!r.inProfiles) return layout(at);
  if (r.profileIndent < 0 || indent === r.profileIndent) return profileName(r, body, indent, at);
  const current = r.current;
  if (!current || indent < r.profileIndent) return layout(at);
  if (r.keyIndent < 0 || indent === r.keyIndent) return profileKey(r, current, body, indent, at);
  if (!r.section || indent < r.keyIndent) return layout(at);
  return r.section === "platforms"
    ? platformLine(r, current, body, indent, at)
    : libraryLine(r, current, body, indent, at);
}

/** Why a profile can't be built with, or null. Every profile is held to the same rules, so no other one is a way in. */
function profileProblem(profile: Profile, options: ProfileCheckOptions): Step {
  if (!profile.fqbn || !KNOWN_FQBNS.has(profile.fqbn))
    return `ask for a board Kiungo doesn't build for${profile.fqbn ? ` (${profile.fqbn})` : ""}`;
  if (!profile.platforms.length) return "don't say which board package to build with";
  for (const p of profile.platforms) {
    if (!KNOWN_PLATFORMS.has(p.id)) return `ask for a board package Kiungo doesn't use (${p.id})`;
    const known = KNOWN_PLATFORMS.get(p.id) ?? null;
    if (p.url !== null && p.url !== known)
      return `download the board package ${p.id} from somewhere other than its maker (${p.url})`;
  }
  if (profile.dirs.length && !options.allowDirs)
    return `use a library from a folder on this computer (${profile.dirs[0]})`;
  return null;
}

/** What in the file's text alone means it isn't one Kiungo wrote. */
function textProblem(yaml: string): Step {
  if (typeof yaml !== "string" || yaml.length > 64 * 1024) return "are too large to be Kiungo's";
  const text = yaml.replace(/^\uFEFF/, "");
  if (/\t/.test(text)) return "use tabs, which Kiungo never writes";
  // YAML also starts a new line at a lone carriage return and at NEL, LS and PS, so a line could hide
  // inside what reads here as one. Kiungo writes plain ASCII with \n or \r\n line ends, and nothing else.
  if (/[^\x20-\x7e\n\r]|\r(?!\n)/.test(text)) return "contain characters Kiungo never writes there";
  return null;
}

export function checkSketchProfile(yaml: string, options: ProfileCheckOptions = {}): ProfileCheck {
  const bad = textProblem(yaml);
  if (bad) return refuse(bad);
  const r: Reader = {
    profiles: new Map(),
    sawProfiles: false,
    sawDefault: false,
    inProfiles: false,
    profileIndent: -1,
    keyIndent: -1,
    itemIndent: -1,
    current: null,
    section: null,
  };
  const lines = yaml.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const shape = lineShape(raw, i);
    if (typeof shape === "string") return refuse(shape);
    const step = readLine(r, shape.indent, shape.body, shape.at);
    if (step) return refuse(step);
  }

  if (!r.profiles.size) return refuse("have no build profile");
  for (const profile of r.profiles.values()) {
    const problem = profileProblem(profile, options);
    if (problem) return refuse(problem);
  }
  const kiungo = r.profiles.get("kiungo");
  if (!kiungo) return refuse('have no "kiungo" profile');
  return { ok: true, fqbn: kiungo.fqbn!, libraries: kiungo.libraries, dirs: kiungo.dirs };
}
