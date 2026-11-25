/**
 * Builds a sketch as a Hybrid build: the user's sketch, unchanged, plus the
 * Kiungo runtime library, the generated forced-include header and any
 * adapter libraries the plan needs (INJ-01, INJ-05's Hybrid profile).
 *
 * Two backends produce the same result:
 *   - Arduino CLI, the product path (`compileSketch` with the extra flags).
 *   - avr-gcc called directly on the Arduino AVR core's sources. Used by the
 *     Sprint 2 spike and by tests on machines that have the compiler but can't
 *     reach downloads.arduino.cc. It mirrors the core's platform.txt recipes.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";

import type { CompileResult } from "@kiungo/api";
import { generateShim, type HybridPlan } from "@kiungo/core/hybrid/shim";

import { compileSketch, type CliLocation } from "./arduino-cli";

/** apps/desktop/resources/hybrid, in development and inside a packaged app. */
export function hybridResourcesDir(resourcesPath?: string): string {
  const packaged = resourcesPath ? join(resourcesPath, "hybrid") : null;
  if (packaged && existsSync(packaged)) return packaged;
  return resolve(__dirname, "..", "..", "..", "resources", "hybrid");
}

export interface HybridBuildInput {
  sketchDir: string;
  buildPath: string;
  plan: HybridPlan;
  /** Where KiungoHybrid and the adapters live. */
  resources: string;
}

/** Writes the generated header and returns everything a backend needs. */
export function prepareHybridBuild(input: HybridBuildInput): { shimHeader: string; libraries: string[]; cppFlags: string[] } {
  mkdirSync(input.buildPath, { recursive: true });
  const shimHeader = join(input.buildPath, "kiungo_shim.h");
  const shim = generateShim(input.plan, shimHeader);
  writeFileSync(shimHeader, shim.header);
  const libraries = [join(input.resources, "KiungoHybrid"), ...shim.adapters.map((name) => join(input.resources, "adapters", name))];
  return { shimHeader, libraries, cppFlags: shim.cppFlags };
}

/** The product path: Arduino CLI with the Hybrid additions. */
export async function compileHybridWithCli(cli: CliLocation, input: HybridBuildInput): Promise<CompileResult> {
  const prepared = prepareHybridBuild(input);
  return compileSketch(cli, input.sketchDir, input.plan.board, input.buildPath, undefined, { libraries: prepared.libraries, cppFlags: prepared.cppFlags });
}

// ----- the direct avr-gcc backend -----

export interface DirectToolchain {
  /** Folder with avr-gcc, avr-g++, avr-gcc-ar, avr-objcopy, avr-size (or "" to use PATH). */
  bin: string;
  /** The ArduinoCore-avr checkout or installed core: has cores/arduino and variants/standard. */
  core: string;
  /** Extra library folders to resolve `#include <X.h>` from, lowest priority last. */
  libraries?: string[];
}

/** Finds the direct toolchain from the environment, or from an Arduino CLI data folder. */
export function locateDirectToolchain(env: NodeJS.ProcessEnv = process.env): DirectToolchain | null {
  const core = env.KIUNGO_AVR_CORE;
  if (core && existsSync(join(core, "cores", "arduino"))) {
    return { bin: env.KIUNGO_AVR_BIN ?? "", core, libraries: env.KIUNGO_AVR_LIBRARIES ? env.KIUNGO_AVR_LIBRARIES.split(delimiter) : [] };
  }
  const data = env.KIUNGO_ARDUINO_DATA; // the `directories.data` of an Arduino CLI config
  if (data) {
    const installed = join(data, "packages", "arduino", "hardware", "avr");
    if (existsSync(installed)) {
      const version = readdirSync(installed).sort().pop();
      const tools = join(data, "packages", "arduino", "tools", "avr-gcc");
      const toolVersion = existsSync(tools) ? readdirSync(tools).sort().pop() : undefined;
      if (version) return { bin: toolVersion ? join(tools, toolVersion, "bin") : "", core: join(installed, version), libraries: [] };
    }
  }
  return null;
}

export interface DirectBuildOptions {
  lto?: boolean;
  /** Compile the sketch and libraries without LTO while the core keeps it (the --wrap fallback needs this). */
  noLtoForSketch?: boolean;
  cppFlags?: string[];
  ldFlags?: string[];
  libraries?: string[];
  mcu?: "atmega328p";
  /** Where the compiled core is kept between builds. Default: a per-toolchain folder under the temp dir. */
  coreCacheDir?: string;
}

interface Sizes {
  flash: number;
  ram: number;
}

function run(bin: string, tool: string, args: string[], cwd: string): string {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  return execFileSync(bin ? join(bin, exe) : exe, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

function sizes(bin: string, elf: string): Sizes {
  const out = run(bin, "avr-size", ["-A", elf], process.cwd());
  const section = (name: string) => Number(out.match(new RegExp(`^\\.${name}\\s+(\\d+)`, "m"))?.[1] ?? 0);
  return { flash: section("text") + section("data"), ram: section("data") + section("bss") };
}

function listSources(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => exts.some((e) => f.endsWith(e)))
    .map((f) => join(dir, f));
}

/** The headers a sketch includes with <...>, to pick which libraries to compile in. */
function includedHeaders(sketchDir: string): Set<string> {
  const headers = new Set<string>();
  for (const file of listSources(sketchDir, [".ino", ".cpp", ".h"])) {
    for (const m of readFileSync(file, "utf8").matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)) headers.add(m[1]);
  }
  return headers;
}

/**
 * Compiles like Arduino CLI does for arduino:avr:uno (platform.txt 1.8.6):
 * the core into core.a with LTO, each library and the sketch to objects,
 * then one link with --gc-sections. Returns the same shape as compileSketch.
 */
export function compileDirect(tc: DirectToolchain, sketchDir: string, buildPath: string, options: DirectBuildOptions = {}): CompileResult & { elf?: string } {
  const started = performance.now();
  const lto = options.lto ?? true;
  const mcu = options.mcu ?? "atmega328p";
  const coreDir = join(tc.core, "cores", "arduino");
  const variantDir = join(tc.core, "variants", "standard");
  // The core only depends on the toolchain, the core sources, the MCU and LTO, so one build of it
  // serves every sketch (Arduino CLI caches it the same way). Keyed on those four.
  const coreKey = createHash("sha1").update([tc.bin, tc.core, mcu, String(lto)].join("|")).digest("hex").slice(0, 12);
  const coreBuild = options.coreCacheDir ?? join(tmpdir(), `kiungo-core-${coreKey}`);
  mkdirSync(coreBuild, { recursive: true });
  mkdirSync(buildPath, { recursive: true });
  const log: string[] = [];
  const common = ["-g", "-Os", "-w", "-ffunction-sections", "-fdata-sections", `-mmcu=${mcu}`, "-DF_CPU=16000000L", "-DARDUINO=10819", "-DARDUINO_AVR_UNO", "-DARDUINO_ARCH_AVR"];
  const ltoFlag = lto ? ["-flto", "-fno-fat-lto-objects"] : [];
  const cxxFlags = ["-c", "-std=gnu++11", "-fpermissive", "-fno-exceptions", "-fno-threadsafe-statics", "-Wno-error=narrowing", ...common];
  const cFlags = ["-c", "-std=gnu11", ...common];
  const coreIncludes = ["-I" + coreDir, "-I" + variantDir];

  try {
    // 1. The core (cached by this build folder).
    const coreArchive = join(coreBuild, "core.a");
    if (!existsSync(coreArchive)) {
      const objects: string[] = [];
      for (const src of listSources(coreDir, [".c"])) {
        const obj = join(coreBuild, basename(src) + ".o");
        run(tc.bin, "avr-gcc", [...cFlags, ...ltoFlag, ...coreIncludes, src, "-o", obj], buildPath);
        objects.push(obj);
      }
      for (const src of listSources(coreDir, [".cpp"])) {
        const obj = join(coreBuild, basename(src) + ".o");
        run(tc.bin, "avr-g++", [...cxxFlags, ...ltoFlag, ...coreIncludes, src, "-o", obj], buildPath);
        objects.push(obj);
      }
      for (const src of listSources(coreDir, [".S"])) {
        const obj = join(coreBuild, basename(src) + ".o");
        run(tc.bin, "avr-gcc", ["-c", "-g", "-x", "assembler-with-cpp", ...(lto ? ["-flto"] : []), `-mmcu=${mcu}`, "-DF_CPU=16000000L", "-DARDUINO=10819", "-DARDUINO_AVR_UNO", "-DARDUINO_ARCH_AVR", ...coreIncludes, src, "-o", obj], buildPath);
        objects.push(obj);
      }
      const partial = coreArchive + ".partial";
      run(tc.bin, "avr-gcc-ar", ["rcs", partial, ...objects], coreBuild);
      renameSync(partial, coreArchive); // another process may build the same core at the same time
    }

    // 2. Libraries: the ones the sketch includes, resolved first from options.libraries (explicit), then tc.libraries.
    const headers = includedHeaders(sketchDir);
    const candidates = [...(options.libraries ?? []), ...(tc.libraries ?? [])];
    const used: string[] = [];
    for (const lib of candidates) {
      const srcDir = existsSync(join(lib, "src")) ? join(lib, "src") : lib;
      const libHeaders = listSources(srcDir, [".h"]).map((h) => basename(h));
      const explicit = (options.libraries ?? []).includes(lib);
      if (explicit || libHeaders.some((h) => headers.has(h))) {
        if (!used.some((u) => basename(u) === basename(lib))) used.push(srcDir);
      }
    }
    const libIncludes = used.map((d) => "-I" + d);
    const sketchLto = options.noLtoForSketch ? ["-fno-lto"] : ltoFlag;
    const objects: string[] = [];
    for (const dir of used) {
      for (const src of listSources(dir, [".cpp"])) {
        const obj = join(buildPath, basename(dir) + "-" + basename(src) + ".o");
        run(tc.bin, "avr-g++", [...cxxFlags, ...sketchLto, ...(options.cppFlags ?? []), ...coreIncludes, ...libIncludes, src, "-o", obj], buildPath);
        objects.push(obj);
      }
      for (const src of listSources(dir, [".c"])) {
        const obj = join(buildPath, basename(dir) + "-" + basename(src) + ".o");
        run(tc.bin, "avr-gcc", [...cFlags, ...sketchLto, ...coreIncludes, ...libIncludes, src, "-o", obj], buildPath);
        objects.push(obj);
      }
    }

    // 3. The sketch: .ino files become one .cpp with Arduino.h on top, as arduino-cli does.
    const inos = listSources(sketchDir, [".ino"]);
    const name = basename(sketchDir);
    const merged = join(buildPath, `${name}.ino.cpp`);
    writeFileSync(merged, "#include <Arduino.h>\n#line 1\n" + inos.map((f) => readFileSync(f, "utf8")).join("\n"));
    const sketchObj = join(buildPath, `${name}.ino.cpp.o`);
    run(tc.bin, "avr-g++", [...cxxFlags, ...sketchLto, ...(options.cppFlags ?? []), ...coreIncludes, ...libIncludes, merged, "-o", sketchObj], buildPath);
    objects.push(sketchObj);
    for (const src of listSources(sketchDir, [".cpp"])) {
      const obj = join(buildPath, basename(src) + ".o");
      run(tc.bin, "avr-g++", [...cxxFlags, ...sketchLto, ...(options.cppFlags ?? []), ...coreIncludes, ...libIncludes, src, "-o", obj], buildPath);
      objects.push(obj);
    }

    // 4. Link, then HEX.
    const elf = join(buildPath, `${name}.ino.elf`);
    run(tc.bin, "avr-gcc", ["-w", "-Os", "-g", ...(lto ? ["-flto", "-fuse-linker-plugin"] : []), "-Wl,--gc-sections", `-mmcu=${mcu}`, ...(options.ldFlags ?? []), "-o", elf, ...objects, coreArchive, "-lm"], buildPath);
    const hexFile = join(buildPath, `${name}.ino.hex`);
    run(tc.bin, "avr-objcopy", ["-O", "ihex", "-R", ".eeprom", elf, hexFile], buildPath);
    const size = sizes(tc.bin, elf);
    return {
      ok: true,
      hex: readFileSync(hexFile, "utf8"),
      elf,
      flash: { used: size.flash, max: 32256 },
      ram: { used: size.ram, max: 2048 },
      durationMs: Math.round(performance.now() - started),
      log: log.join("\n"),
    };
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    return { ok: false, durationMs: Math.round(performance.now() - started), log: (e.stderr || e.message || String(error)).trim() };
  }
}

/** A Hybrid build through the direct backend. */
export function compileHybridDirect(tc: DirectToolchain, input: HybridBuildInput, options: Omit<DirectBuildOptions, "cppFlags" | "libraries"> = {}): CompileResult & { elf?: string } {
  const prepared = prepareHybridBuild(input);
  return compileDirect(tc, input.sketchDir, input.buildPath, { ...options, cppFlags: prepared.cppFlags, libraries: prepared.libraries });
}
