/**
 * Arduino CLI, run as a child process with JSON output (BLD-01, spike #52).
 *
 * Arduino CLI is GPL-3.0, so it ships as its own program next to the app and
 * is only ever started as a separate process (Phase Two flag 11).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { CompileResult, InstallResult, ToolchainStatus } from "@kiungo/api";

export interface CliLocation {
  /** The arduino-cli executable. */
  binary: string;
  /** The config file that sets Kiungo's own data, download and sketchbook folders. */
  configFile: string;
}

export interface CliPaths {
  platform: NodeJS.Platform;
  arch: string;
  /** Where the packaged app keeps extra resources (process.resourcesPath). */
  resourcesDir: string;
  /** The app's source folder in development. */
  devResourcesDir: string;
  /** The app's data folder (app.getPath("userData")). */
  userDataDir: string;
  env: NodeJS.ProcessEnv;
}

const exe = (platform: NodeJS.Platform) => (platform === "win32" ? "arduino-cli.exe" : "arduino-cli");

/** Where the app looks for Arduino CLI, in order. */
export function cliCandidates(p: CliPaths): string[] {
  const name = exe(p.platform);
  return [
    p.env.KIUNGO_ARDUINO_CLI,
    join(p.resourcesDir, "bin", name),
    join(p.devResourcesDir, "bin", `${p.platform}-${p.arch}`, name),
  ].filter((x): x is string => Boolean(x));
}

/**
 * Finds Arduino CLI and makes sure Kiungo's own config exists, so the app's
 * toolchains never mix with an Arduino IDE the user may also have.
 */
export function locateCli(p: CliPaths): CliLocation | null {
  const binary = cliCandidates(p).find((c) => existsSync(c));
  if (!binary) return null;
  if (p.env.KIUNGO_ARDUINO_CONFIG) return { binary, configFile: p.env.KIUNGO_ARDUINO_CONFIG };
  const root = join(p.userDataDir, "arduino");
  const configFile = join(root, "arduino-cli.yaml");
  if (!existsSync(configFile)) {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      configFile,
      [
        "directories:",
        `  data: ${JSON.stringify(join(root, "data"))}`,
        `  downloads: ${JSON.stringify(join(root, "downloads"))}`,
        `  user: ${JSON.stringify(join(root, "sketchbook"))}`,
        "",
      ].join("\n"),
    );
  }
  return { binary, configFile };
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(cli: CliLocation, args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cli.binary,
      ["--config-file", cli.configFile, "--no-color", ...args],
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Pulls the first JSON document out of Arduino CLI's output (warnings can precede it). */
export function parseJson<T>(stdout: string): T | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start)) as T;
  } catch {
    return null;
  }
}

interface VersionJson {
  VersionString?: string;
}
interface CoreListJson {
  platforms?: Array<{ id: string; installed_version?: string }>;
}
export interface CompileJson {
  success?: boolean;
  compiler_out?: string;
  compiler_err?: string;
  builder_result?: {
    build_path?: string;
    executable_sections_size?: Array<{ name: string; size: number; max_size: number }>;
  };
}

export async function toolchainStatus(cli: CliLocation | null): Promise<ToolchainStatus> {
  if (!cli) {
    return { cli: { found: false, hint: "Arduino CLI isn't installed with this build. In development, run npm run fetch:arduino-cli in apps/desktop." }, cores: [] };
  }
  const version = parseJson<VersionJson>((await runCli(cli, ["version", "--format", "json"], 20_000)).stdout);
  const cores = parseJson<CoreListJson>((await runCli(cli, ["core", "list", "--format", "json"], 30_000)).stdout);
  return {
    cli: { found: true, version: version?.VersionString ?? "unknown", path: cli.binary },
    cores: (cores?.platforms ?? []).filter((c) => c.installed_version).map((c) => ({ id: c.id, version: c.installed_version as string })),
  };
}

/** Turns Arduino CLI's compile report into what the interface shows. */
export function compileReport(json: CompileJson | null, raw: RunResult, durationMs: number): Omit<CompileResult, "hex"> {
  const sections = json?.builder_result?.executable_sections_size ?? [];
  const text = sections.find((s) => s.name === "text");
  const data = sections.find((s) => s.name === "data");
  const log = [json?.compiler_out, json?.compiler_err].filter(Boolean).join("\n").trim() || raw.stderr.trim() || raw.stdout.trim();
  return {
    ok: Boolean(json?.success) && raw.code === 0,
    flash: text ? { used: text.size, max: text.max_size } : undefined,
    ram: data ? { used: data.size, max: data.max_size } : undefined,
    durationMs,
    log,
  };
}

export interface CompileOptions {
  /** Library folders added with `--library`; these win over installed libraries of the same name. */
  libraries?: string[];
  /** Extra C++ compiler flags, e.g. a forced include for a Hybrid build. */
  cppFlags?: string[];
  /** Extra flags for every compile and link step. */
  extraFlags?: string[];
}

/** Compiles a sketch folder and returns the program as Intel HEX. */
export async function compileSketch(
  cli: CliLocation,
  sketchDir: string,
  fqbn: string,
  buildPath: string,
  now: () => number = () => performance.now(),
  options: CompileOptions = {},
): Promise<CompileResult> {
  mkdirSync(buildPath, { recursive: true });
  const started = now();
  const args = ["compile", "--fqbn", fqbn, "--build-path", buildPath, "--format", "json"];
  for (const library of options.libraries ?? []) args.push("--library", library);
  if (options.cppFlags?.length) args.push("--build-property", `compiler.cpp.extra_flags=${options.cppFlags.join(" ")}`);
  if (options.extraFlags?.length) args.push("--build-property", `build.extra_flags=${options.extraFlags.join(" ")}`);
  args.push(sketchDir);
  const raw = await runCli(cli, args, 300_000);
  const report = compileReport(parseJson<CompileJson>(raw.stdout), raw, Math.round(now() - started));
  if (!report.ok) return report;
  const hexFile = join(buildPath, `${basename(sketchDir)}.ino.hex`);
  if (!existsSync(hexFile)) return { ...report, ok: false, log: `${report.log}\nThe build finished but ${basename(hexFile)} wasn't written.`.trim() };
  return { ...report, hex: readFileSync(hexFile, "utf8") };
}

/** Downloads a board core and its compiler into Kiungo's own data folder. Needs the internet once. */
export async function installCore(cli: CliLocation, core: string, now: () => number = () => performance.now()): Promise<InstallResult> {
  const started = now();
  const index = await runCli(cli, ["core", "update-index"], 300_000);
  if (index.code !== 0) return { ok: false, durationMs: Math.round(now() - started), log: (index.stderr || index.stdout).trim() };
  const install = await runCli(cli, ["core", "install", core], 900_000);
  return { ok: install.code === 0, durationMs: Math.round(now() - started), log: [index.stdout, install.stdout, install.stderr].join("\n").trim() };
}
