/**
 * The files in a project's sketch folder, for the editor (EDT-01, EDT-04).
 *
 * Names are plain file names in sketch/, never paths: anything with a folder
 * separator, a dot-dot, or an extension Arduino doesn't build is refused, so
 * the interface can't reach outside the sketch. The main file (sketch.ino)
 * can't be renamed or deleted, and sketch.yaml belongs to Kiungo, so neither
 * shows up for editing. Saves are crash-safe; deletes go to the computer's
 * trash.
 */

import { lstat, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SKETCH_DIR, SKETCH_FILE, SKETCH_PROFILE_FILE } from "@kiungo/core/project";
import type { SketchFile, SketchResult } from "@kiungo/api";
import { writeFileAtomic } from "./atomic";

/** What Arduino CLI compiles from a sketch folder, plus notes. */
export const SKETCH_EXTENSIONS = [".ino", ".h", ".hpp", ".c", ".cpp", ".S", ".tpp", ".ipp", ".txt", ".md"] as const;
/** The editor is for code: files larger than this open read-only elsewhere. */
export const MAX_FILE_BYTES = 1_000_000;

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
};

/** Null if the name is fine, else why not. */
export function checkFileName(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "Give the file a name.";
  if (name !== name.trim()) return "File names can't start or end with a space.";
  if (name.length > 64) return "Keep file names to 64 characters.";
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name) || name.includes("..")) return "File names can't contain / \\ : * ? \" < > | or two dots in a row.";
  if (name.startsWith(".")) return "File names can't start with a dot.";
  if (name === SKETCH_PROFILE_FILE) return "sketch.yaml is Kiungo's build settings for this sketch.";
  const ext = extOf(name);
  if (!(SKETCH_EXTENSIONS as readonly string[]).includes(ext)) return `Use one of ${SKETCH_EXTENSIONS.join(" ")}: those are what Arduino builds.`;
  // Arduino sketches build files whose names are C identifiers plus the extension; a space breaks the build.
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) return "Use letters, numbers, - and _ only: Arduino can't build file names with spaces.";
  return null;
}

export class SketchFiles {
  constructor(private readonly trash: (path: string) => Promise<void>) {}

  private dir(project: string) {
    return join(project, SKETCH_DIR);
  }

  async list(project: string): Promise<SketchFile[]> {
    const names = await readdir(this.dir(project)).catch(() => [] as string[]);
    const files: SketchFile[] = [];
    for (const name of names) {
      if (name === SKETCH_PROFILE_FILE || name.startsWith(".") || name.includes(".kiungo-tmp-")) continue;
      if (!(SKETCH_EXTENSIONS as readonly string[]).includes(extOf(name))) continue;
      // lstat: a link to a file elsewhere on the computer isn't part of the sketch.
      const info = await lstat(join(this.dir(project), name)).catch(() => null);
      if (!info?.isFile()) continue;
      files.push({ name, main: name === SKETCH_FILE, size: info.size });
    }
    return files.sort((a, b) => Number(b.main) - Number(a.main) || a.name.localeCompare(b.name));
  }

  async read(project: string, name: string): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
    const problem = checkFileName(name);
    if (problem) return { ok: false, message: problem };
    try {
      const path = join(this.dir(project), name);
      const info = await lstat(path);
      if (!info.isFile()) return { ok: false, message: `${name} isn't a file in the sketch: Kiungo doesn't open links to files elsewhere.` };
      if (info.size > MAX_FILE_BYTES) return { ok: false, message: `${name} is over 1 MB, too large for the editor.` };
      return { ok: true, content: await readFile(path, "utf8") };
    } catch {
      return { ok: false, message: `${name} isn't in the sketch any more.` };
    }
  }

  async write(project: string, name: string, content: unknown): Promise<SketchResult> {
    const problem = checkFileName(name);
    if (problem) return { ok: false, message: problem };
    if (typeof content !== "string") return { ok: false, message: "Nothing to save." };
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) return { ok: false, message: `${name} is over 1 MB. Split it into smaller files.` };
    try {
      await writeFileAtomic(join(this.dir(project), name), content);
      return { ok: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOSPC") return { ok: false, message: "The disk is full. Free some space; your code is still in the editor." };
      if (code === "EACCES" || code === "EPERM" || code === "EROFS") return { ok: false, message: "Kiungo isn't allowed to write in the project folder." };
      return { ok: false, message: `Couldn't save ${name}.` };
    }
  }

  async create(project: string, name: string): Promise<SketchResult> {
    const problem = checkFileName(name);
    if (problem) return { ok: false, message: problem };
    if (extOf(name) === ".ino") return { ok: false, message: "A sketch has one .ino file. Use .h and .cpp files for the rest of your code." };
    const path = join(this.dir(project), name);
    if (await exists(path)) return { ok: false, message: `There's already a file called ${name}.` };
    try {
      // "wx": fails if it appeared in the meantime, so nothing is ever overwritten.
      await writeFile(path, starterFor(name), { flag: "wx" });
      return { ok: true };
    } catch {
      return { ok: false, message: `Couldn't make ${name}.` };
    }
  }

  async rename(project: string, from: string, to: string): Promise<SketchResult> {
    const problem = checkFileName(from) ?? checkFileName(to);
    if (problem) return { ok: false, message: problem };
    if (from === SKETCH_FILE) return { ok: false, message: "The main sketch file keeps its name, so Arduino can find it." };
    if (extOf(to) === ".ino") return { ok: false, message: "A sketch has one .ino file. Use .h or .cpp." };
    if (from === to) return { ok: true };
    const dir = this.dir(project);
    if (!(await exists(join(dir, from)))) return { ok: false, message: `${from} isn't in the sketch any more.` };
    // Case-only renames are the same file on Windows and macOS: let those through.
    if (from.toLowerCase() !== to.toLowerCase() && (await exists(join(dir, to)))) return { ok: false, message: `There's already a file called ${to}.` };
    try {
      await rename(join(dir, from), join(dir, to));
      return { ok: true };
    } catch {
      return { ok: false, message: `Couldn't rename ${from}.` };
    }
  }

  async remove(project: string, name: string): Promise<SketchResult> {
    const problem = checkFileName(name);
    if (problem) return { ok: false, message: problem };
    if (name === SKETCH_FILE) return { ok: false, message: "The main sketch file can't be deleted." };
    const path = join(this.dir(project), name);
    if (!(await exists(path))) return { ok: true };
    try {
      await this.trash(path);
      return { ok: true };
    } catch {
      return { ok: false, message: `Couldn't move ${name} to the trash.` };
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** What a new file starts with: an include guard for headers, nothing for the rest. */
export function starterFor(name: string): string {
  const ext = extOf(name);
  if (ext === ".h" || ext === ".hpp") {
    const guard = `${name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
    return `#ifndef ${guard}\n#define ${guard}\n\n#include <Arduino.h>\n\n#endif\n`;
  }
  if (ext === ".cpp" || ext === ".c") return `#include <Arduino.h>\n`;
  return "";
}
