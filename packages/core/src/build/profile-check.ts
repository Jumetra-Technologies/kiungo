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

export type ProfileCheck = { ok: true; fqbn: string; libraries: ProfileLibrary[]; dirs: string[] } | { ok: false; message: string };

/** Board packages Kiungo builds with, and the only index each may come from. */
const KNOWN_PLATFORMS: ReadonlyMap<string, string | null> = (() => {
  const map = new Map<string, string | null>();
  for (const b of [...PROJECT_BOARDS, ...HARDWARE_BOARDS]) map.set(b.platform.id, b.platform.indexUrl ?? null);
  return map;
})();
const KNOWN_FQBNS: ReadonlySet<string> = new Set([...PROJECT_BOARDS, ...HARDWARE_BOARDS].map((b) => b.fqbn));

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
    else if (!quoted && c === "#" && i > 0 && /\s/.test(line[i - 1])) return line.slice(0, i).trimEnd();
  }
  return line;
}

export function checkSketchProfile(yaml: string, options: ProfileCheckOptions = {}): ProfileCheck {
  if (typeof yaml !== "string" || yaml.length > 64 * 1024) return refuse("are too large to be Kiungo's");
  const text = yaml.replace(/^\uFEFF/, "");
  if (/\t/.test(text)) return refuse("use tabs, which Kiungo never writes");
  // YAML also starts a new line at a lone carriage return and at NEL, LS and PS, so a line could hide
  // inside what reads here as one. Kiungo writes plain ASCII with \n or \r\n line ends, and nothing else.
  if (/[^\x20-\x7e\n\r]|\r(?!\n)/.test(text)) return refuse("contain characters Kiungo never writes there");

  const profiles = new Map<string, Profile>();
  let sawProfiles = false;
  let sawDefault = false;
  let inProfiles = false;
  let profileIndent = -1;
  let keyIndent = -1;
  let itemIndent = -1;
  let current: Profile | null = null;
  let section: "platforms" | "libraries" | null = null;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const line = uncomment(raw);
    // Kiungo writes whole-line comments only: text after a setting is refused, not cut off.
    if (line.trimEnd() !== raw.trimEnd()) return refuse(`have a comment after a setting (line ${i + 1})`);
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    const at = `(line ${i + 1})`;
    // Characters that change what YAML means (anchors, aliases, tags, flow and block styles, documents).
    if (/^(---|\.\.\.)/.test(body) || /(^|[\s:])[&*!|>[\]{}]/.test(body.replace(/"(?:[^"\\]|\\.)*"/g, '""')) || body.startsWith("? ") || body.includes("<<")) {
      return refuse(`contain YAML Kiungo doesn't write ${at}`);
    }

    if (indent === 0) {
      inProfiles = false;
      current = null;
      section = null;
      if (body === "profiles:") {
        if (sawProfiles) return refuse(`list profiles twice ${at}`);
        sawProfiles = inProfiles = true;
        continue;
      }
      const def = /^default_profile: (\S+)$/.exec(body);
      if (def && PROFILE_NAME.test(def[1]) && !sawDefault) {
        sawDefault = true;
        continue;
      }
      return refuse(`contain a setting Kiungo doesn't use ${at}`);
    }
    if (!inProfiles) return refuse(`aren't laid out the way Kiungo writes them ${at}`);

    // A profile's name.
    if (profileIndent < 0 || indent === profileIndent) {
      const name = /^([^\s:]+):$/.exec(body)?.[1];
      if (!name || !PROFILE_NAME.test(name)) return refuse(`name a profile Kiungo can't read ${at}`);
      if (profiles.has(name)) return refuse(`list the profile "${name}" twice ${at}`);
      profileIndent = indent;
      keyIndent = -1;
      itemIndent = -1;
      section = null;
      current = { name, fqbn: null, platforms: [], libraries: [], dirs: [], keys: new Set() };
      profiles.set(name, current);
      continue;
    }
    if (!current || indent < profileIndent) return refuse(`aren't laid out the way Kiungo writes them ${at}`);

    // A profile's own settings: fqbn, platforms, libraries.
    if (keyIndent < 0 || indent === keyIndent) {
      const kv = /^([a-z_]+):(?: (.*))?$/.exec(body);
      if (!kv) return refuse(`aren't laid out the way Kiungo writes them ${at}`);
      const [, key, value = ""] = kv;
      if (current.keys.has(key)) return refuse(`set "${key}" twice ${at}`);
      current.keys.add(key);
      keyIndent = indent;
      itemIndent = -1;
      section = null;
      if (key === "fqbn" && value) {
        current.fqbn = value.trim();
        continue;
      }
      if ((key === "platforms" || key === "libraries") && !value) {
        section = key;
        continue;
      }
      return refuse(`contain a setting Kiungo doesn't use, "${key}" ${at}`);
    }
    if (!section || indent < keyIndent) return refuse(`aren't laid out the way Kiungo writes them ${at}`);

    if (section === "platforms") {
      if (itemIndent < 0 || indent === itemIndent) {
        const m = /^- platform: (.+)$/.exec(body);
        const p = m ? PLATFORM.exec(m[1].trim()) : null;
        if (!p) return refuse(`name a board package Kiungo can't read ${at}`);
        if (p[2] && !VERSION.test(p[2])) return refuse(`give the board package ${p[1]} a version Kiungo can't read ${at}`);
        itemIndent = indent;
        current.platforms.push({ id: p[1], version: p[2] ?? null, url: null });
        continue;
      }
      const last = current.platforms.at(-1);
      const url = /^platform_index_url: (\S+)$/.exec(body)?.[1];
      if (indent !== itemIndent + 2 || !last || last.url !== null || !url) return refuse(`aren't laid out the way Kiungo writes them ${at}`);
      last.url = url;
      continue;
    }

    // Libraries.
    if (itemIndent >= 0 && indent !== itemIndent) return refuse(`aren't laid out the way Kiungo writes them ${at}`);
    itemIndent = indent;
    const item = /^- (.+)$/.exec(body)?.[1]?.trim();
    if (!item) return refuse(`aren't laid out the way Kiungo writes them ${at}`);
    const dir = /^dir: (.+)$/.exec(item);
    if (dir) {
      const path = dirValue(dir[1].trim());
      if (!path) return refuse(`name a library folder Kiungo can't read ${at}`);
      current.dirs.push(path);
      continue;
    }
    const dep = /^dependency: (.+)$/.exec(item);
    const lib = LIBRARY.exec((dep ? dep[1] : item).trim());
    if (!lib || !VERSION.test(lib[2])) return refuse(`name a library Kiungo can't read ${at}`);
    current.libraries.push({ name: lib[1].trim(), version: lib[2], dependency: Boolean(dep) });
  }

  if (!profiles.size) return refuse("have no build profile");
  // Every profile is held to the same rules, so no other one is a way in.
  for (const profile of profiles.values()) {
    if (!profile.fqbn || !KNOWN_FQBNS.has(profile.fqbn)) return refuse(`ask for a board Kiungo doesn't build for${profile.fqbn ? ` (${profile.fqbn})` : ""}`);
    if (!profile.platforms.length) return refuse("don't say which board package to build with");
    for (const p of profile.platforms) {
      if (!KNOWN_PLATFORMS.has(p.id)) return refuse(`ask for a board package Kiungo doesn't use (${p.id})`);
      const known = KNOWN_PLATFORMS.get(p.id) ?? null;
      if (p.url !== null && p.url !== known) return refuse(`download the board package ${p.id} from somewhere other than its maker (${p.url})`);
    }
    if (profile.dirs.length && !options.allowDirs) return refuse(`use a library from a folder on this computer (${profile.dirs[0]})`);
  }
  const kiungo = profiles.get("kiungo");
  if (!kiungo) return refuse('have no "kiungo" profile');
  return { ok: true, fqbn: kiungo.fqbn!, libraries: kiungo.libraries, dirs: kiungo.dirs };
}
