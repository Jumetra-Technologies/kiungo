// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEdits, checkSketchProfile, explain, libraryForHeader, quickFix } from "@kiungo/core/build";
import { buildStarter, PROJECT_BOARDS, sketchProfile, STARTERS } from "@kiungo/core/project";
import { hardwareBoard } from "@kiungo/core/hardware/boards";
import { BuildService, setupProblem } from "../src/main/build/service";
import { BoardWatcher } from "../src/main/hardware/boards";
import { HybridService, hybridProfile } from "../src/main/hybrid/service";
import { hybridResourcesDir } from "../src/main/toolchain/hybrid-build";
import { hybridBindings, hybridValues, packDht } from "@kiungo/core/hybrid/plan";
import { encodeSet, LinkReader } from "@kiungo/core/hybrid/protocol";
import { analyze } from "@kiungo/core/lab/circuit";
import { AvrBoard } from "@kiungo/core/emulator";
import { UNO } from "@kiungo/core/boards";
import { runCli, type CliLocation, type RunResult } from "../src/main/toolchain/arduino-cli";

const CLI: CliLocation = { binary: "/fake/arduino-cli", configFile: "/fake/arduino-cli.yaml" };
let root: string;
let project: string;
let calls: string[][];

function service(answer: (args: string[]) => RunResult | Promise<RunResult>, cli: CliLocation | null = CLI) {
  return new BuildService({
    cli: () => cli,
    buildsDir: join(root, "builds"),
    run: async (_cli, args) => {
      calls.push(args);
      return answer(args);
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kiungo-build-"));
  project = join(root, "Rover");
  mkdirSync(join(project, "sketch"), { recursive: true });
  writeFileSync(join(project, "sketch", "sketch.ino"), "void setup() {}\nvoid loop() {}\n");
  writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(PROJECT_BOARDS[0], [{ name: "Servo", version: "1.3.0" }]));
  calls = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const ok = (json: object): RunResult => ({ code: 0, stdout: JSON.stringify(json), stderr: "" });

describe("building a project (BLD-01, BLD-02, BLD-05)", () => {
  it("builds with the sketch's own profile, in a build folder outside the project", async () => {
    const builds = service((args) => {
      writeFileSync(join(args[args.indexOf("--build-path") + 1], "sketch.ino.hex"), ":00000001FF\n");
      return ok({
        success: true,
        compiler_out: "Sketch uses 924 bytes (2%) of program storage space.",
        builder_result: { executable_sections_size: [{ name: "text", size: 924, max_size: 32256 }, { name: "data", size: 9, max_size: 2048 }] },
      });
    });
    const result = await builds.compile(project);
    expect(calls[0].slice(0, 3)).toEqual(["compile", "--profile", "kiungo"]);
    expect(calls[0].at(-1)).toBe(join(project, "sketch"));
    expect(calls[0][calls[0].indexOf("--build-path") + 1].startsWith(join(root, "builds"))).toBe(true);
    expect(result).toMatchObject({ ok: true, diagnostics: [], hex: ":00000001FF\n", flash: { used: 924, max: 32256 }, ram: { used: 9, max: 2048 } });
  });

  it("an unchanged sketch uses the last good build, without running the compiler (Run in under 2 s)", async () => {
    const builds = service((args) => {
      writeFileSync(join(args[args.indexOf("--build-path") + 1], "sketch.ino.hex"), ":00000001FF\n");
      return ok({ success: true, builder_result: { executable_sections_size: [{ name: "text", size: 924, max_size: 32256 }, { name: "data", size: 9, max_size: 2048 }] } });
    });
    const first = await builds.compile(project);
    expect(first.cached).toBeUndefined();
    const second = await builds.compile(project);
    expect(calls).toHaveLength(1);
    expect(second).toMatchObject({ ok: true, cached: true, hex: ":00000001FF\n", flash: { used: 924, max: 32256 } });
    writeFileSync(join(project, "sketch", "sketch.ino"), "void setup() {}\nvoid loop() { }\n");
    await builds.compile(project);
    expect(calls).toHaveLength(2);
    // A failed build is never reused.
    writeFileSync(join(project, "sketch", "sketch.ino"), "void setup() {\n");
    const failing = service(() => ({ code: 1, stdout: JSON.stringify({ success: false }), stderr: "" }));
    await failing.compile(project);
    await failing.compile(project);
    expect(calls).toHaveLength(4);
  });

  it("maps the compiler's problems to the sketch", async () => {
    const err = `${join(project, "sketch", "sketch.ino")}:4:1: error: expected ';' before '}' token`;
    const result = await service(() => ({ code: 1, stdout: JSON.stringify({ success: false, compiler_err: err }), stderr: "" })).compile(project);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toMatchObject([{ file: "sketch.ino", line: 4, column: 1 }]);
    expect(result.message).toBeUndefined();
  });

  it("a build that never reached the compiler says why in plain words", async () => {
    const result = await service(() => ({ code: 1, stdout: "", stderr: 'Error downloading platform arduino:avr@1.8.6: Get "https://downloads.arduino.cc/...": dial tcp: lookup downloads.arduino.cc: no such host' })).compile(project);
    expect(result.message).toMatch(/needs the internet once/);
  });

  it("one build per project at a time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const builds = service(async () => {
      await gate;
      return { code: 1, stdout: "{}", stderr: "" };
    });
    const a = builds.compile(project);
    const b = builds.compile(project);
    expect(b).toBe(a);
    release();
    await a;
    expect(calls).toHaveLength(1);
  });

  it("without Arduino CLI or build settings, says so instead of failing", async () => {
    expect((await service(() => ok({}), null).compile(project)).message).toMatch(/Arduino CLI isn't installed/);
    rmSync(join(project, "sketch", "sketch.yaml"));
    expect((await service(() => ok({})).compile(project)).message).toMatch(/no build settings/);
  });

  it("the same project always builds in the same folder", () => {
    const builds = service(() => ok({}));
    expect(builds.buildPath(project)).toBe(builds.buildPath(project));
    expect(builds.buildPath(project)).not.toBe(builds.buildPath(join(root, "Other")));
  });
});

describe("libraries (BLD-04)", () => {
  it("lists what sketch.yaml pins", async () => {
    expect(await service(() => ok({})).libraries(project)).toEqual([{ name: "Servo", version: "1.3.0", dependency: false }]);
  });

  it("search keeps libraries that work on AVR boards", async () => {
    const result = await service(() =>
      ok({
        libraries: [
          { name: "Servo", latest: { version: "1.3.0", sentence: "Allows Arduino boards to control servo motors", author: "Michael Margolis, Arduino", architectures: ["avr", "megaavr", "sam"] } },
          { name: "ESP32Servo", latest: { version: "3.0.6", sentence: "For ESP32", author: "Kevin Harrington", architectures: ["esp32"] } },
          { name: "NewPing", latest: { version: "1.9.7", sentence: "Ultrasonic sensors", author: "Tim Eckel", website: "https://bitbucket.org/teckel12/arduino-new-ping", architectures: ["*"] } },
        ],
      }),
    ).search("servo");
    expect(result).toEqual({
      ok: true,
      libraries: [
        { name: "Servo", version: "1.3.0", sentence: "Allows Arduino boards to control servo motors", author: "Michael Margolis, Arduino", website: null },
        { name: "NewPing", version: "1.9.7", sentence: "Ultrasonic sensors", author: "Tim Eckel", website: "https://bitbucket.org/teckel12/arduino-new-ping" },
      ],
    });
    expect(calls[0]).toEqual(["lib", "search", "--omit-releases-details", "--format", "json", "--", "servo"]);
  });

  it("search text is never read as one of Arduino CLI's options", async () => {
    await service(() => ok({ libraries: [] })).search("--config-file=/tmp/evil.yaml");
    expect(calls[0].slice(-2)).toEqual(["--", "--config-file=/tmp/evil.yaml"]);
  });

  it("adding goes through Arduino CLI, which pins the library and what it needs", async () => {
    const yaml = join(project, "sketch", "sketch.yaml");
    const result = await service((args) => {
      if (args[0] === "profile") {
        writeFileSync(yaml, readFileSync(yaml, "utf8").replace("      - Servo (1.3.0)\n", "      - Servo (1.3.0)\n      - DHT sensor library (1.4.7)\n      - dependency: Adafruit Unified Sensor (1.1.15)\n"));
        return ok({ added_libraries: [{ index_library: { name: "DHT sensor library", version: "1.4.7" } }, { index_library: { name: "Adafruit Unified Sensor", version: "1.1.15" } }], profile_name: "kiungo" });
      }
      return ok({});
    }).add(project, "DHT sensor library");
    expect(calls.map((c) => c.slice(0, 4))).toEqual([
      ["lib", "update-index"],
      ["profile", "lib", "add", "DHT sensor library"],
    ]);
    expect(calls[1]).toEqual(expect.arrayContaining(["--profile", "kiungo", "--sketch-path", join(project, "sketch")]));
    expect(result).toEqual({
      ok: true,
      added: ["DHT sensor library 1.4.7", "Adafruit Unified Sensor 1.1.15"],
      libraries: [
        { name: "Servo", version: "1.3.0", dependency: false },
        { name: "DHT sensor library", version: "1.4.7", dependency: false },
        { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true },
      ],
    });
  });

  it("a library that isn't in the index is named", async () => {
    const result = await service((args) => (args[0] === "profile" ? { code: 1, stdout: "", stderr: "Error adding Nope: library not found" } : ok({}))).add(project, "Nope", "1.0.0");
    expect(result).toEqual({ ok: false, message: "There's no library called “Nope” in the Arduino library index." });
    expect(calls[1][3]).toBe("Nope@1.0.0");
  });

  it("offline, adding says it needs the internet", async () => {
    const result = await service(() => ({ code: 1, stdout: "", stderr: "Error downloading index: dial tcp: i/o timeout" })).add(project, "Servo");
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/internet/) });
  });

  it("edits to sketch.yaml happen one at a time", async () => {
    let inside = 0;
    let most = 0;
    const builds = service(async () => {
      most = Math.max(most, ++inside);
      await new Promise((r) => setTimeout(r, 5));
      inside--;
      return ok({});
    });
    await Promise.all([builds.add(project, "Servo"), builds.remove(project, "Servo"), builds.add(project, "Stepper")]);
    expect(most).toBe(1);
  });
});

describe("build settings from someone else's project (security audit)", () => {
  const yaml = () => join(project, "sketch", "sketch.yaml");
  const EVIL = [
    "profiles:",
    "  kiungo:",
    "    fqbn: evil:avr:uno",
    "    platforms:",
    "      - platform: evil:avr (1.0.0)",
    "        platform_index_url: https://evil.example/package_evil_index.json",
    "default_profile: kiungo",
    "",
  ].join("\n");
  const hexOk = (args: string[]) => {
    const at = args.indexOf("--build-path");
    if (at >= 0) writeFileSync(join(args[at + 1], "sketch.ino.hex"), ":00000001FF\n");
    return ok({ success: true });
  };

  it("a board package from elsewhere never reaches Arduino CLI: not to build, upload, or edit libraries", async () => {
    writeFileSync(yaml(), EVIL);
    const builds = service(hexOk);
    expect(await builds.compile(project)).toMatchObject({ ok: false, message: expect.stringMatching(/won't build this project/) });
    const uno = hardwareBoard("uno")!;
    expect(await builds.upload(project, "/dev/ttyACM0", uno, "linux")).toMatchObject({ ok: false, stage: "build" });
    expect(await builds.uploadFolder(join(project, "sketch"), builds.buildPath(project, uno.fqbn), "/dev/ttyACM0", uno, "linux", { projectPath: project })).toMatchObject({ ok: false, stage: "upload" });
    expect(await builds.add(project, "Servo")).toMatchObject({ ok: false, message: expect.stringMatching(/won't build this project/) });
    expect(calls).toEqual([]);
  });

  it("a library folder in the project is refused; Kiungo's own Hybrid folders are allowed in its copy", async () => {
    writeFileSync(yaml(), `${sketchProfile(PROJECT_BOARDS[0])}`.replace("default_profile", "    libraries:\n      - dir: ../records/lib\ndefault_profile"));
    expect(await service(hexOk).compile(project)).toMatchObject({ ok: false, message: expect.stringMatching(/library from a folder/) });
    const kiungoRoot = join(root, "hybrid-resources");
    const builds = service(hexOk);
    const copy = join(root, "copy", "sketch");
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, "sketch.ino"), "void setup() {}\nvoid loop() {}\n");
    const withDir = (dir: string) => sketchProfile(PROJECT_BOARDS[0]).replace("default_profile", `    libraries:\n      - dir: ${JSON.stringify(dir)}\ndefault_profile`);
    writeFileSync(join(copy, "sketch.yaml"), withDir(join(kiungoRoot, "KiungoHybrid")));
    expect((await builds.compileFolder(copy, "arduino:avr:uno", [], kiungoRoot)).result.ok).toBe(true);
    writeFileSync(join(copy, "sketch.yaml"), withDir(join(root, "elsewhere")));
    expect((await builds.compileFolder(copy, "arduino:avr:uno", [], kiungoRoot)).result).toMatchObject({ ok: false, message: expect.stringMatching(/isn't Kiungo's own/) });
  });

  it("the Hybrid copy's profile, as Kiungo writes it, passes for the Uno and the Nano", () => {
    // An install folder under a name with letters outside ASCII still builds.
    const dirs = [join(hybridResourcesDir(), "KiungoHybrid"), join(hybridResourcesDir(), "adapters", "DHT"), join("/home/José/Kiungo/resources/hybrid", "KiungoHybrid")];
    const original = sketchProfile(PROJECT_BOARDS[0], [{ name: "DHT sensor library", version: "1.4.7" }, { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true }]);
    for (const fqbn of ["arduino:avr:uno", "arduino:avr:nano:cpu=atmega328"]) {
      expect(checkSketchProfile(hybridProfile(original, fqbn, dirs, ["DHT sensor library"]), { allowDirs: true })).toMatchObject({ ok: true, dirs });
    }
  });

  it("libraries this computer hasn't built with are asked about first; no means no build", async () => {
    const asked: string[][] = [];
    let answer = false;
    const builds = new BuildService({
      cli: () => CLI,
      buildsDir: join(root, "builds"),
      run: async (_c, args) => (calls.push(args), hexOk(args)),
      approveLibraries: async (path, libs) => {
        expect(path).toBe(project);
        asked.push(libs.map((l) => l.name));
        return answer;
      },
    });
    expect(await builds.compile(project)).toMatchObject({ ok: false, message: expect.stringMatching(/Build cancelled/) });
    expect(asked).toEqual([["Servo"]]);
    expect(calls).toEqual([]);
    answer = true;
    expect((await builds.compile(project)).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("libraries the person adds themselves are trusted from then on", async () => {
    const trusted: string[][] = [];
    const builds = new BuildService({
      cli: () => CLI,
      buildsDir: join(root, "builds"),
      run: async (_c, args) => {
        calls.push(args);
        // Arduino CLI's report names what it installed; Other Lib only appears in the rewritten file.
        if (args[0] === "profile") {
          writeFileSync(yaml(), readFileSync(yaml(), "utf8").replace("      - Servo (1.3.0)\n", "      - Servo (1.3.0)\n      - NewPing (1.9.7)\n      - Other Lib (1.0.0)\n"));
          return ok({ added_libraries: [{ index_library: { name: "NewPing", version: "1.9.7" } }] });
        }
        return ok({});
      },
      trustLibraries: async (names) => void trusted.push(names),
    });
    expect((await builds.add(project, "NewPing")).ok).toBe(true);
    // Only what this add brought in: Servo was already there, from wherever the project came from.
    expect(trusted).toEqual([["NewPing"]]);
  });
});

describe("setupProblem", () => {
  it("leaves alone what it doesn't recognize", () => {
    expect(setupProblem("something else")).toBeNull();
  });
});

// Runs where Arduino CLI is set up (CI's desktop matrix): real profile builds, which download what sketch.yaml pins.
const realCli = process.env.KIUNGO_ARDUINO_CLI && process.env.KIUNGO_ARDUINO_CONFIG ? { binary: process.env.KIUNGO_ARDUINO_CLI, configFile: process.env.KIUNGO_ARDUINO_CONFIG } : null;
describe.skipIf(!realCli)("building with the real Arduino CLI", () => {
  const real = () => new BuildService({ cli: () => realCli, buildsDir: join(root, "builds"), run: runCli });
  const make = (starter: string | null, board = PROJECT_BOARDS[0]) => {
    const { code, libraries } = buildStarter({ name: "Test", board: board.part, starter });
    writeFileSync(join(project, "sketch", "sketch.ino"), code);
    writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(board, libraries));
  };

  for (const starter of STARTERS) {
    it(`the ${starter.title} starter builds with what it pins`, async () => {
      make(starter.id);
      const result = await real().compile(project);
      expect(result.message, result.log).toBeUndefined();
      expect(result.ok, result.log).toBe(true);
      expect(result.hex?.startsWith(":")).toBe(true);
      expect(result.flash?.max).toBe(32256);
      expect(result.ram?.max).toBe(2048);
    }, 600_000);
  }

  it("Blink builds for the Mega with its own limits", async () => {
    make("blink", PROJECT_BOARDS[1]);
    const result = await real().compile(project);
    expect(result.ok, result.log).toBe(true);
    expect(result.flash?.max).toBe(253952);
  }, 600_000);

  it("a mistake comes back on its line, explained, with a fix that builds", async () => {
    make("blink");
    const file = join(project, "sketch", "sketch.ino");
    const good = readFileSync(file, "utf8");
    const broken = good.replace("pinMode(LED_PIN, OUTPUT);", "pinMode(LED_PIN, OUTPUT)");
    writeFileSync(file, broken);
    const builds = real();
    const result = await builds.compile(project);
    expect(result.ok).toBe(false);
    const [problem] = result.diagnostics;
    expect(problem).toMatchObject({ file: "sketch.ino", severity: "error" });
    expect(explain(problem)?.id).toBe("missing-semicolon");
    const fix = quickFix(problem, broken, result.diagnostics);
    expect(applyEdits(broken, fix!.edits)).toBe(good);
  }, 600_000);

  it("a missing library is named by its header", async () => {
    make("servo");
    writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(PROJECT_BOARDS[0]));
    const result = await real().compile(project);
    const [problem] = result.diagnostics;
    expect(explain(problem)).toMatchObject({ id: "missing-library", header: "Servo.h" });
    expect(libraryForHeader("Servo.h")?.name).toBe("Servo");
  }, 600_000);
});

describe.skipIf(!realCli)("Hybrid builds with the real Arduino CLI (sprint 9)", () => {
  /** The starter's project, its board on the desk and its sensors played by Kiungo. */
  const hybridProject = (starter: string) => {
    const { code, libraries, session } = buildStarter({ name: "Test", board: "arduino-uno", starter });
    writeFileSync(join(project, "sketch", "sketch.ino"), code);
    writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(PROJECT_BOARDS[0], libraries));
    const nodes = session.nodes.map((n, i) => (i === 0 ? { ...n, mode: "physical" as const } : n));
    return hybridBindings(nodes, analyze(nodes, session.wires), nodes[0].id);
  };
  const hybrid = () => new HybridService(new BuildService({ cli: () => realCli, buildsDir: join(root, "builds"), run: runCli }), { resources: hybridResourcesDir(), workDir: join(root, "hybrid") });
  const run = (hex: string) => {
    const board = new AvrBoard(UNO, hex);
    const reader = new LinkReader();
    const lines: string[] = [];
    board.onSerialByte((b) => lines.push(...reader.feedLines(Uint8Array.of(b)).lines));
    return { board, lines };
  };

  it("the Distance sensor starter: Ship and Hybrid builds, Kiungo's share apart, and a virtual HC-SR04 answers it", async () => {
    const bindings = hybridProject("distance");
    const { build, ship } = await hybrid().build(project, hardwareBoard("uno")!, bindings.plan);
    expect(build.ok, build.log).toBe(true);
    expect(ship.ok).toBe(true);
    expect(build.ship?.flash.used).toBe(ship.flash?.used);
    expect(build.overhead!.flash).toBeGreaterThan(0);
    expect(build.overhead!.ram).toBeGreaterThan(0);
    console.log(`Hybrid layer for the Distance sensor: +${build.overhead!.flash} B flash, +${build.overhead!.ram} B RAM`);
    const { board, lines } = run(build.hex!);
    board.runMs(50);
    for (const [id, value] of hybridValues(bindings, [{ kind: "hc-sr04", id: bindings.sensors[0].nodeId, trig: 2, echo: 3, distanceCm: 42 }])) board.writeSerial(encodeSet(id, value));
    board.runMs(700);
    const readings = lines.map((l) => Number.parseFloat(l)).filter((n) => !Number.isNaN(n));
    expect(readings.at(-1)).toBeCloseTo(42, 0);
  }, 600_000);

  it("the DHT11 starter builds with the adapter in place of the DHT library, and reads what Kiungo sends", async () => {
    const bindings = hybridProject("dht11");
    const { build } = await hybrid().build(project, hardwareBoard("uno")!, bindings.plan);
    expect(build.ok, build.log).toBe(true);
    const { board, lines } = run(build.hex!);
    board.runMs(100);
    board.writeSerial(encodeSet(0, packDht(23.4, 55)));
    board.runMs(4300);
    expect(lines).toContain("Temperature: 23.40 C, humidity: 55.00 %");
  }, 600_000);

  it("a mistake stops at the Ship build, on the sketch's own line", async () => {
    const bindings = hybridProject("distance");
    const file = join(project, "sketch", "sketch.ino");
    writeFileSync(file, readFileSync(file, "utf8").replace("pinMode(TRIG_PIN, OUTPUT);", "pinMode(TRIG_PIN, OUTPUT)"));
    const { build } = await hybrid().build(project, hardwareBoard("uno")!, bindings.plan);
    expect(build.ok).toBe(false);
    // The Ship build stops first, with the sketch's own lines.
    expect(build.diagnostics[0]).toMatchObject({ file: "sketch.ino", severity: "error" });
  }, 600_000);
});

describe.skipIf(!realCli)("boards and uploads with the real Arduino CLI", () => {
  it("finds the serial ports (none on a CI machine) without failing", async () => {
    const watcher = new BoardWatcher({ cli: () => realCli, run: runCli, spawn: () => { throw new Error("not watching in this test"); }, onChange: () => undefined });
    const boards = await watcher.refresh();
    expect(Array.isArray(boards)).toBe(true);
    expect(watcher.message).toBeNull();
  }, 120_000);

  it("an upload to a port that isn't there fails with steps, not a crash", async () => {
    const { code, libraries } = buildStarter({ name: "Test", board: "arduino-uno", starter: "blink" });
    writeFileSync(join(project, "sketch", "sketch.ino"), code);
    writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(PROJECT_BOARDS[0], libraries));
    const builds = new BuildService({ cli: () => realCli, buildsDir: join(root, "builds"), run: runCli });
    const port = process.platform === "win32" ? "COM250" : "/dev/ttyKIUNGO0";
    const result = await builds.upload(project, port, hardwareBoard("uno")!, process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux");
    console.log(`upload to a missing port: ${result.problem?.id}\n${result.log}`);
    expect(result).toMatchObject({ ok: false, stage: "upload" });
    expect(result.problem?.steps.length).toBeGreaterThan(0);
    expect(["port-missing", "unknown"]).toContain(result.problem?.id);
  }, 600_000);

  // The ESP32 board package is large: CI builds it on one system (KIUNGO_TEST_ESP32).
  it.skipIf(!process.env.KIUNGO_TEST_ESP32)("Blink builds for the ESP32 with its pinned board package", async () => {
    const { code, libraries } = buildStarter({ name: "Test", board: "esp32", starter: "blink" });
    writeFileSync(join(project, "sketch", "sketch.ino"), code);
    writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(PROJECT_BOARDS[2], libraries));
    const result = await new BuildService({ cli: () => realCli, buildsDir: join(root, "builds"), run: runCli }).compile(project);
    expect(result.ok, result.log).toBe(true);
    expect(result.flash?.max).toBe(1_310_720);
  }, 1_800_000);
});
