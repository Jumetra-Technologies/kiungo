/**
 * A Hybrid run (RUN-01, RUN-04, INJ-01 to INJ-06): the user's sketch on the
 * real board, with Kiungo playing the virtual parts.
 *
 *  1. The Ship build: the sketch as it is, which is what the board would run
 *     without Kiungo. It judges whether the program fits (HWT-03).
 *  2. The Hybrid build: a copy of the sketch with the runtime and the shim,
 *     for the board chosen. Its extra flash and RAM are the Hybrid layer's
 *     cost, shown apart (HWT-02, HWT-04).
 *  3. Upload it, then talk to the board over the link: push the virtual
 *     parts' values, read the sketch's Serial text and what it drove (OUT-01).
 *
 * The copy keeps the sketch's own files byte for byte after two added lines
 * at the top of each (the marker and the shim) and a #line that puts the
 * compiler's line numbers back where they belong.
 */

import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuildResult, UploadResult } from "@kiungo/api";
import { readSketchProfile } from "@kiungo/core/build";
import type { HardwareBoard } from "@kiungo/core/hardware/boards";
import type { HostPlatform } from "@kiungo/core/hardware/upload";
import { generateShim, type HybridPlan } from "@kiungo/core/hybrid/shim";
import { SKETCH_DIR, SKETCH_FILE, SKETCH_PROFILE_FILE } from "@kiungo/core/project";
import type { BuildService } from "../build/service";
import { PROFILE } from "../build/service";

/** Libraries an adapter stands in for: the real ones leave the Hybrid profile. */
const REPLACED: Record<string, string[]> = {
  NewPing: ["NewPing"],
  DHT: ["DHT sensor library"],
};

const SOURCE = /\.(ino|cpp|c|h|hpp)$/;

/** The sketch.yaml of the Hybrid copy: the same board package and libraries, the replaced ones swapped for Kiungo's. */
export function hybridProfile(original: string, fqbn: string, libraryDirs: string[], replaced: string[]): string {
  const info = readSketchProfile(original, PROFILE);
  const drop = new Set(replaced.map((n) => n.toLowerCase()));
  const lines = ["# Written by Kiungo for a Hybrid build: a copy, rewritten every build.", "profiles:", `  ${PROFILE}:`, `    fqbn: ${fqbn}`, "    platforms:"];
  for (const p of info.platforms) lines.push(`      - platform: ${p.id}${p.version ? ` (${p.version})` : ""}`);
  lines.push("    libraries:");
  for (const l of info.libraries) if (!drop.has(l.name.toLowerCase())) lines.push(`      - ${l.dependency ? "dependency: " : ""}${l.name} (${l.version})`);
  // \u escapes for anything outside ASCII (a user folder called José): the build check takes plain ASCII only.
  for (const dir of libraryDirs) lines.push(`      - dir: ${JSON.stringify(dir).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}`);
  lines.push(`default_profile: ${PROFILE}`, "");
  return lines.join("\n");
}

/** One sketch file in the copy: the marker (so Arduino CLI finds the runtime), the shim, then the file as it was. */
export function shimmedSource(name: string, source: string): string {
  return `#include <kiungo_hybrid_marker.h>\n#include "kiungo_shim.h"\n#line 1 "${name}"\n${source}`;
}

/** The build property that forces the shim into every C++ compile. */
export function hybridFlags(shimPath: string): string {
  return `compiler.cpp.extra_flags=-include "${shimPath}"`;
}

export interface HybridBuild {
  /** The Hybrid build's result, with what the Kiungo layer adds. */
  build: BuildResult;
  /** The Ship build: the sketch without Kiungo. */
  ship: BuildResult;
  /** The folder the Hybrid program is in, for the upload. */
  buildPath: string;
}

export class HybridService {
  constructor(
    private readonly builds: BuildService,
    private readonly opts: { resources: string; workDir: string },
  ) {}

  get workDir(): string {
    return this.opts.workDir;
  }

  /** Build the Ship and Hybrid programs for the board. */
  async build(projectPath: string, board: HardwareBoard, plan: HybridPlan): Promise<HybridBuild> {
    const ship = await this.builds.compile(projectPath, board.fqbn);
    if (!ship.ok) return { build: ship, ship, buildPath: "" };
    const shim = generateShim(plan, "kiungo_shim.h");
    const copy = join(this.opts.workDir, "sketch");
    // The copy is rewritten every build; its build folder beside it stays, so an unchanged sketch builds quickly.
    await rm(copy, { recursive: true, force: true });
    await mkdir(copy, { recursive: true });
    const sketchDir = join(projectPath, SKETCH_DIR);
    for (const name of await readdir(sketchDir)) {
      if (name === SKETCH_PROFILE_FILE || name.startsWith(".")) continue;
      // Plain files only: a link would copy in whatever it points at elsewhere on the computer.
      if (!(await lstat(join(sketchDir, name)).catch(() => null))?.isFile()) continue;
      if (SOURCE.test(name)) await writeFile(join(copy, name), shimmedSource(name, await readFile(join(sketchDir, name), "utf8")));
      else await copyFile(join(sketchDir, name), join(copy, name));
    }
    await writeFile(join(copy, "kiungo_shim.h"), shim.header);
    const libraries = [join(this.opts.resources, "KiungoHybrid"), ...shim.adapters.map((a) => join(this.opts.resources, "adapters", a))];
    const replaced = shim.adapters.flatMap((a) => REPLACED[a] ?? []);
    const original = await readFile(join(sketchDir, SKETCH_PROFILE_FILE), "utf8").catch(() => "");
    await writeFile(join(copy, SKETCH_PROFILE_FILE), hybridProfile(original, board.fqbn, libraries, replaced));
    // The shim goes into every C++ file, the runtime and adapters included: they need its pin table.
    // The core's own files skip it (no marker on their include path).
    const hybrid = await this.builds.compileFolder(copy, board.fqbn, [hybridFlags(join(copy, "kiungo_shim.h"))], this.opts.resources);
    // Problems in the copy are the sketch's: its file names are the same, its lines are put back by #line.
    const build: BuildResult = { ...hybrid.result, diagnostics: hybrid.result.diagnostics.map((d) => (d.file === "kiungo_shim.h" ? { ...d, file: null } : d)) };
    if (build.ok && ship.flash && build.flash && ship.ram && build.ram) {
      build.overhead = { flash: build.flash.used - ship.flash.used, ram: build.ram.used - ship.ram.used };
      build.ship = { flash: ship.flash, ram: ship.ram };
    }
    if (!build.ok && !build.diagnostics.some((d) => d.file && d.file !== SKETCH_FILE) && ship.flash && build.flash && build.flash.used > build.flash.max) {
      build.message = `Your program fits the ${board.name} (${ship.flash.used.toLocaleString("en-US")} of ${ship.flash.max.toLocaleString("en-US")} bytes), but with Kiungo's Hybrid layer it doesn't. Mark some parts Physical, or run it all in the lab.`;
    }
    return { build, ship, buildPath: hybrid.buildPath };
  }

  async upload(projectPath: string, port: string, board: HardwareBoard, plan: HybridPlan, platform: HostPlatform, onStage: (stage: "building" | "uploading") => void): Promise<UploadResult & { overheadNote?: string }> {
    const started = performance.now();
    onStage("building");
    const { build, buildPath } = await this.build(projectPath, board, plan);
    if (!build.ok) return { ok: false, stage: "build", build, log: build.log, durationMs: Math.round(performance.now() - started) };
    onStage("uploading");
    const result = await this.builds.uploadFolder(join(this.opts.workDir, "sketch"), buildPath, port, board, platform, { libraryRoot: this.opts.resources });
    return { ...result, build, durationMs: Math.round(performance.now() - started) };
  }
}
