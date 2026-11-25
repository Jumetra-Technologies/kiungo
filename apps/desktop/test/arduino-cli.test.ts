// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INVOKE_CHANNELS, isInvokeChannel } from "@kiungo/api";
import { cliCandidates, compileReport, compileSketch, locateCli, parseJson, type CompileJson } from "../src/main/toolchain/arduino-cli";

const paths = (over: Partial<Parameters<typeof cliCandidates>[0]> = {}) => ({
  platform: "win32" as NodeJS.Platform,
  arch: "x64",
  resourcesDir: "C:/Program Files/Kiungo/resources",
  devResourcesDir: "/repo/apps/desktop/resources",
  userDataDir: mkdtempSync(join(tmpdir(), "kiungo-")),
  env: {},
  ...over,
});

describe("finding Arduino CLI", () => {
  it("looks in the override, then the installed app, then the development folder", () => {
    expect(cliCandidates(paths({ env: { KIUNGO_ARDUINO_CLI: "/x/arduino-cli" } }))).toEqual([
      "/x/arduino-cli",
      join("C:/Program Files/Kiungo/resources", "bin", "arduino-cli.exe"),
      join("/repo/apps/desktop/resources", "bin", "win32-x64", "arduino-cli.exe"),
    ]);
  });

  it("writes Kiungo's own config, so toolchains never mix with an Arduino IDE install", () => {
    const p = paths({ platform: "linux", env: { KIUNGO_ARDUINO_CLI: process.execPath } });
    const cli = locateCli(p);
    expect(cli?.binary).toBe(process.execPath);
    const config = readFileSync(cli!.configFile, "utf8");
    expect(config).toContain(JSON.stringify(join(p.userDataDir, "arduino", "data")));
    expect(config).toContain(JSON.stringify(join(p.userDataDir, "arduino", "sketchbook")));
  });

  it("returns nothing when no binary exists", () => {
    expect(locateCli(paths({ platform: "linux", resourcesDir: "/nope", devResourcesDir: "/nope" }))).toBeNull();
  });
});

describe("reading Arduino CLI output", () => {
  const ok: CompileJson = {
    success: true,
    compiler_out: "Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.\n",
    builder_result: {
      executable_sections_size: [
        { name: "text", size: 924, max_size: 32256 },
        { name: "data", size: 9, max_size: 2048 },
      ],
    },
  };

  it("skips warnings printed before the JSON", () => {
    expect(parseJson<{ a: number }>('warning: something\n{"a":1}')).toEqual({ a: 1 });
    expect(parseJson("no json here")).toBeNull();
  });

  it("reports flash and RAM against the board's real limits", () => {
    const r = compileReport(ok, { code: 0, stdout: "", stderr: "" }, 1234);
    expect(r).toMatchObject({ ok: true, flash: { used: 924, max: 32256 }, ram: { used: 9, max: 2048 }, durationMs: 1234 });
    expect(r.log).toContain("924 bytes");
  });

  it("fails when Arduino CLI says so or exits with an error", () => {
    expect(compileReport({ ...ok, success: false, compiler_err: "Blink.ino:4: error: expected ';'" }, { code: 1, stdout: "", stderr: "" }, 1).ok).toBe(false);
    expect(compileReport(null, { code: 1, stdout: "", stderr: "Error: no such board" }, 1)).toMatchObject({ ok: false, log: "Error: no such board" });
  });
});

describe("the IPC contract", () => {
  it("accepts only the listed channels", () => {
    for (const c of INVOKE_CHANNELS) expect(isInvokeChannel(c)).toBe(true);
    expect(isInvokeChannel("fs:read")).toBe(false);
    expect(isInvokeChannel(42)).toBe(false);
  });
});

// Runs where Arduino CLI and the Uno core are set up: KIUNGO_ARDUINO_CLI and KIUNGO_ARDUINO_CONFIG.
const real = process.env.KIUNGO_ARDUINO_CLI && process.env.KIUNGO_ARDUINO_CONFIG;
describe.skipIf(!real)("compiling with the real Arduino CLI", () => {
  it("compiles the bundled Blink for the Uno into Intel HEX", async () => {
    const cli = { binary: process.env.KIUNGO_ARDUINO_CLI!, configFile: process.env.KIUNGO_ARDUINO_CONFIG! };
    const build = mkdtempSync(join(tmpdir(), "kiungo-build-"));
    const result = await compileSketch(cli, join(__dirname, "..", "resources", "sketches", "Blink"), "arduino:avr:uno", build);
    expect(result.ok).toBe(true);
    expect(result.hex?.startsWith(":")).toBe(true);
    expect(result.flash).toEqual({ used: 924, max: 32256 });
    expect(existsSync(join(build, "Blink.ino.hex"))).toBe(true);
  }, 120_000);
});
