// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hardwareBoard } from "@kiungo/core/hardware/boards";
import { PROJECT_BOARDS, sketchProfile } from "@kiungo/core/project";
import { BuildService } from "../src/main/build/service";
import { BoardWatcher, toDetected } from "../src/main/hardware/boards";
import { diagnosePorts, type DoctorEnv } from "../src/main/hardware/doctor";
import { monitorMessage, SerialMonitor } from "../src/main/hardware/serial";
import type { CliLocation, RunResult } from "../src/main/toolchain/arduino-cli";

const CLI: CliLocation = { binary: "/fake/arduino-cli", configFile: "/fake/arduino-cli.yaml" };

/** A stand-in for a spawned Arduino CLI: what it prints, what it was sent, and its exit. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  sent = "";
  killed = false;
  constructor(readonly args: string[]) {
    super();
    this.stdin.setEncoding("utf8");
    this.stdin.on("data", (d: string) => (this.sent += d));
  }
  kill() {
    this.killed = true;
    this.emit("exit", null);
    return true;
  }
  print(text: string) {
    this.stdout.write(text);
  }
}
const asChild = (c: FakeChild) => c as unknown as ChildProcess;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const UNO_PORT = { address: "/dev/ttyACM0", protocol: "serial", properties: { pid: "0x0043", vid: "0x2341", serialNumber: "8573" } };
const CH340_PORT = { address: "/dev/ttyUSB0", protocol: "serial", properties: { pid: "0x7523", vid: "0x1A86" } };

describe("finding boards on USB (HW-01)", () => {
  it("reads Arduino CLI's ports", () => {
    expect(toDetected(UNO_PORT, [{ name: "Arduino Uno", fqbn: "arduino:avr:uno" }])).toEqual({ port: "/dev/ttyACM0", protocol: "serial", usbId: "2341:0043", serialNumber: "8573", matches: [{ name: "Arduino Uno", fqbn: "arduino:avr:uno" }] });
    expect(toDetected({ protocol: "serial" }, [])).toBeNull();
  });

  it("lists what's plugged in, then follows plugging and unplugging", async () => {
    const children: FakeChild[] = [];
    const changes: string[][] = [];
    const watcher = new BoardWatcher({
      cli: () => CLI,
      run: async () => ({ code: 0, stdout: JSON.stringify({ detected_ports: [{ matching_boards: [{ name: "Arduino Uno", fqbn: "arduino:avr:uno" }], port: UNO_PORT }, { port: { address: "192.168.1.5", protocol: "network" } }] }), stderr: "" }),
      spawn: (_c, args) => {
        const child = new FakeChild(args);
        children.push(child);
        return asChild(child);
      },
      onChange: (boards) => changes.push(boards.map((b) => b.port)),
    });
    await watcher.start();
    expect(watcher.list().map((b) => b.port)).toEqual(["/dev/ttyACM0"]);
    expect(children[0].args).toEqual(["board", "list", "--watch", "--format", "jsonmini"]);
    children[0].print(`${JSON.stringify({ eventType: "add", port: CH340_PORT })}\n{"eventType":"remove","port":${JSON.stringify(UNO_PORT)}}\n`);
    await tick();
    expect(watcher.list().map((b) => [b.port, b.usbId])).toEqual([["/dev/ttyUSB0", "1a86:7523"]]);
    expect(watcher.has("/dev/ttyUSB0")).toBe(true);
    expect(watcher.has("/dev/ttyACM0")).toBe(false);
    expect(changes.at(-1)).toEqual(["/dev/ttyUSB0"]);
    watcher.stop();
  });

  it("restarts discovery when it stops", async () => {
    vi.useFakeTimers();
    try {
      const children: FakeChild[] = [];
      const watcher = new BoardWatcher({
        cli: () => CLI,
        run: async () => ({ code: 0, stdout: '{"detected_ports":[]}', stderr: "" }),
        spawn: (_c, args) => {
          const child = new FakeChild(args);
          children.push(child);
          return asChild(child);
        },
        onChange: () => undefined,
        restartDelayMs: 100,
      });
      await watcher.start();
      children[0].emit("exit", 1);
      await vi.advanceTimersByTimeAsync(150);
      expect(children).toHaveLength(2);
      watcher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("without Arduino CLI, says why", async () => {
    const watcher = new BoardWatcher({ cli: () => null, run: async () => ({ code: 0, stdout: "", stderr: "" }), spawn: () => asChild(new FakeChild([])), onChange: () => undefined });
    await watcher.start();
    expect(watcher.message).toMatch(/Arduino CLI/);
    expect(watcher.list()).toEqual([]);
  });
});

describe("the serial monitor (HW-02)", () => {
  function monitor() {
    const children: FakeChild[] = [];
    const data: string[] = [];
    const closed: Array<string | null> = [];
    const m = new SerialMonitor({
      cli: () => CLI,
      spawn: (_c, args) => {
        const child = new FakeChild(args);
        children.push(child);
        return asChild(child);
      },
      onData: (_p, text) => data.push(text),
      onClosed: (_p, message) => closed.push(message),
      batchMs: 5,
    });
    return { m, children, data, closed };
  }

  it("opens the port at the speed asked, batches what arrives, and sends what's typed", async () => {
    const { m, children, data } = monitor();
    expect(m.start("/dev/ttyACM0", 115200)).toEqual({ ok: true });
    expect(children[0].args).toEqual(["monitor", "-p", "/dev/ttyACM0", "--config", "baudrate=115200", "--quiet"]);
    children[0].print("Hel");
    children[0].print("lo\n");
    await tick(20);
    expect(data).toEqual(["Hello\n"]);
    expect(m.write("on\n")).toBe(true);
    await tick();
    expect(children[0].sent).toBe("on\n");
    m.stop();
  });

  it("closing on purpose is quiet; the board going away is not", async () => {
    const { m, children, closed } = monitor();
    m.start("/dev/ttyACM0", 9600);
    m.stop();
    expect(children[0].killed).toBe(true);
    expect(closed).toEqual([]);
    m.start("/dev/ttyACM0", 9600);
    children[1].stderr.write("Port closed: EOF\n");
    await tick();
    children[1].emit("exit", 1);
    expect(closed).toEqual(["The board was unplugged."]);
    expect(m.open).toBeNull();
  });

  it("a second port replaces the first", () => {
    const { m, children } = monitor();
    m.start("/dev/ttyACM0", 9600);
    m.start("/dev/ttyUSB0", 9600);
    expect(children[0].killed).toBe(true);
    expect(m.open).toEqual({ port: "/dev/ttyUSB0", baud: 9600 });
    m.stop();
  });

  it("explains why it stopped", () => {
    expect(monitorMessage("Error: Permission denied")).toMatch(/dialout/);
    expect(monitorMessage("Access is denied.")).toMatch(/Another program/);
    expect(monitorMessage("")).toBeNull();
  });
});

describe("when a board doesn't show up (FIX-09)", () => {
  let sys: string;
  beforeEach(() => {
    sys = mkdtempSync(join(tmpdir(), "kiungo-sys-"));
  });
  afterEach(() => rmSync(sys, { recursive: true, force: true }));

  /** A USB device in a fake /sys/bus/usb/devices, with or without its tty. */
  function usbDevice(name: string, vid: string, pid: string, tty: boolean) {
    mkdirSync(join(sys, name, `${name}:1.0`), { recursive: true });
    writeFileSync(join(sys, name, "idVendor"), `${vid}\n`);
    writeFileSync(join(sys, name, "idProduct"), `${pid}\n`);
    if (tty) mkdirSync(join(sys, name, `${name}:1.0`, "ttyUSB0"));
  }
  const env = (over: Partial<DoctorEnv> = {}): DoctorEnv => ({ platform: "linux", usbDevicesDir: sys, brlttyPaths: ["/usr/bin/brltty"], canOpen: async () => true, exists: async () => false, ...over });

  // /sys is Linux's; its folder names have colons, which Windows can't make.
  const linuxOnly = it.skipIf(process.platform === "win32");

  linuxOnly("a CH340 with no port, and brltty installed: remove brltty", async () => {
    usbDevice("1-2", "1a86", "7523", false);
    const hints = await diagnosePorts([], env({ exists: async (p) => p === "/usr/bin/brltty" }));
    expect(hints[0]).toMatchObject({ id: "brltty", title: "A CH340 board is plugged in, but brltty took its port" });
    expect(hints[0].steps.join(" ")).toContain("sudo apt remove brltty");
  });

  linuxOnly("a CH340 with its port is fine; a port you can't open needs dialout", async () => {
    usbDevice("1-2", "1a86", "7523", true);
    const board = { port: "/dev/ttyUSB0", protocol: "serial", usbId: "1a86:7523", serialNumber: null, matches: [] };
    expect(await diagnosePorts([board], env())).toEqual([]);
    const hints = await diagnosePorts([board], env({ canOpen: async () => false }));
    expect(hints.map((h) => h.id)).toEqual(["dialout"]);
  });

  it("on Windows with nothing plugged in: the drivers, from the chip makers, and the cable", async () => {
    const hints = await diagnosePorts([], env({ platform: "win32" }));
    expect(hints.map((h) => h.id)).toEqual(["driver-ch340", "driver-cp210x", "cable"]);
    expect(hints[0].links?.[0].url).toMatch(/^https:\/\/www\.wch-ic\.com\//);
    expect(hints[1].links?.[0].url).toMatch(/^https:\/\/www\.silabs\.com\//);
  });
});

describe("uploading (BLD-06)", () => {
  let root: string;
  let project: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kiungo-upload-"));
    project = join(root, "Rover");
    mkdirSync(join(project, "sketch"), { recursive: true });
    writeFileSync(join(project, "sketch", "sketch.ino"), "void setup() {}\nvoid loop() {}\n");
    writeFileSync(join(project, "sketch", "sketch.yaml"), sketchProfile(PROJECT_BOARDS[0]));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function service(answer: (args: string[]) => RunResult) {
    const calls: string[][] = [];
    const builds = new BuildService({
      cli: () => CLI,
      buildsDir: join(root, "builds"),
      run: async (_c, args) => {
        calls.push(args);
        if (args[0] === "compile") writeFileSync(join(args[args.indexOf("--build-path") + 1], "sketch.ino.hex"), ":00000001FF\n");
        return answer(args);
      },
    });
    return { builds, calls };
  }
  const compiled = { code: 0, stdout: JSON.stringify({ success: true }), stderr: "" };

  it("builds for the board chosen, then uploads that build to the port", async () => {
    const { builds, calls } = service((args) => (args[0] === "compile" ? compiled : { code: 0, stdout: JSON.stringify({ stdout: "avrdude done.  Thank you.", stderr: "" }), stderr: "" }));
    const stages: string[] = [];
    const result = await builds.upload(project, "/dev/ttyUSB0", hardwareBoard("nano-old")!, "linux", (s) => stages.push(s));
    expect(result).toMatchObject({ ok: true, stage: "upload", log: "avrdude done.  Thank you." });
    expect(stages).toEqual(["building", "uploading"]);
    expect(calls[0]).toEqual(expect.arrayContaining(["--profile", "kiungo", "--fqbn", "arduino:avr:nano:cpu=atmega328old"]));
    const buildDir = calls[0][calls[0].indexOf("--build-path") + 1];
    expect(calls[1].slice(0, 5)).toEqual(["upload", "--profile", "kiungo", "--fqbn", "arduino:avr:nano:cpu=atmega328old"]);
    expect(calls[1]).toEqual(expect.arrayContaining(["-p", "/dev/ttyUSB0", "--input-dir", buildDir]));
    // A board other than the project's own builds in its own folder.
    expect(buildDir).not.toBe(builds.buildPath(project));
  });

  it("a failed upload comes back with recovery steps", async () => {
    const failure = JSON.stringify({ error: "Failed uploading: uploading error: exit status 1", output: { stdout: "", stderr: "avrdude: stk500_getsync() attempt 10 of 10: not in sync: resp=0x00\n" } });
    const { builds } = service((args) => (args[0] === "compile" ? compiled : { code: 1, stdout: failure, stderr: "" }));
    const result = await builds.upload(project, "/dev/ttyUSB0", hardwareBoard("nano")!, "win32");
    expect(result).toMatchObject({ ok: false, stage: "upload", problem: { id: "no-sync", retryWith: "nano-old" } });
    expect(result.log).toContain("not in sync");
  });

  it("a failed build stops before uploading", async () => {
    const { builds, calls } = service(() => ({ code: 1, stdout: JSON.stringify({ success: false, compiler_err: `${join(project, "sketch", "sketch.ino")}:1:1: error: expected ';' before '}' token` }), stderr: "" }));
    const result = await builds.upload(project, "/dev/ttyACM0", hardwareBoard("uno")!, "linux");
    expect(result).toMatchObject({ ok: false, stage: "build" });
    expect(result.build.diagnostics).toHaveLength(1);
    expect(calls.map((c) => c[0])).toEqual(["compile"]);
  });
});
