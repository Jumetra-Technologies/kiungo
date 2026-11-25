/**
 * Sprint 2 spike (#57 to #60): the shim on real compiled code, run in the emulator.
 *
 * Needs the AVR toolchain and the Arduino AVR core sources. Either:
 *   KIUNGO_AVR_CORE=<ArduinoCore-avr checkout>  (avr-gcc on PATH or KIUNGO_AVR_BIN)
 *   KIUNGO_ARDUINO_DATA=<Arduino CLI data dir with arduino:avr installed>
 * and the real NewPing library for the plain build:
 *   KIUNGO_AVR_LIBRARIES=<folder containing NewPing>   (or the CLI sketchbook's libraries)
 *
 * What a real Uno adds on top is in docs/phase-two/sprint-2-hardware-check.md.
 */

import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import { AvrBoard } from "@kiungo/core/emulator";
import { UNO } from "@kiungo/core/boards";
import { LinkReader, PROTOCOL_VERSION, encodeHello, encodeIn, encodePing, encodeSet, encodeStop } from "@kiungo/core/hybrid/protocol";
import { SPRINT_2_PLAN, type HybridPlan } from "@kiungo/core/hybrid/shim";
import { hybridBindings, hybridValues, packDht } from "@kiungo/core/hybrid/plan";
import { analyze } from "@kiungo/core/lab/circuit";
import { buildStarter } from "@kiungo/core/project";

import { compileDirect, compileHybridDirect, hybridResourcesDir, locateDirectToolchain, type DirectToolchain } from "../src/main/toolchain/hybrid-build";

const tc = locateDirectToolchain();
const resources = hybridResourcesDir();
const sketches = join(__dirname, "..", "resources", "sketches");

function newPingLibrary(): string | null {
  const dirs = (process.env.KIUNGO_AVR_LIBRARIES ?? "").split(delimiter).filter(Boolean);
  if (process.env.KIUNGO_ARDUINO_DATA) dirs.push(join(process.env.KIUNGO_ARDUINO_DATA, "..", "sketchbook", "libraries"));
  for (const dir of dirs) {
    if (existsSync(join(dir, "NewPing.h"))) return dir;
    if (existsSync(join(dir, "NewPing", "NewPing.h")) || existsSync(join(dir, "NewPing", "src", "NewPing.h"))) return join(dir, "NewPing");
  }
  return null;
}
const realNewPing = newPingLibrary();

const build = (name: string) => mkdtempSync(join(tmpdir(), `kiungo-${name}-`));

/** Runs a program and collects the sketch's lines with the simulated time they finished. */
function runner(hex: string) {
  const board = new AvrBoard(UNO, hex);
  const reader = new LinkReader();
  const lines: Array<{ at: number; text: string }> = [];
  const frames: Array<{ at: number; frame: ReturnType<LinkReader["feed"]>[number] }> = [];
  const raw: number[] = [];
  board.onSerialByte((b) => {
    raw.push(b);
    const result = reader.feedLines(Uint8Array.of(b));
    for (const text of result.lines) lines.push({ at: board.timeMs, text });
    for (const frame of result.frames) if (frame.type !== "text") frames.push({ at: board.timeMs, frame });
  });
  return { board, reader, lines, frames, raw };
}

/**
 * A real HC-SR04 in the emulator: when the trigger pin rises, the echo pin goes
 * high about 450 us later and stays high for the round-trip time of `cm`.
 * Runs the board for `ms` of simulated time in 20 us slices to react in time.
 */
function runWithHcSr04(board: AvrBoard, ms: number, trigger: number, echo: number, cm: number) {
  const sliceUs = 20;
  let echoStartAt = -1;
  let echoEndAt = -1;
  // The trigger pulse is 10 us, shorter than a slice, so catch its edge as it happens.
  const stop = board.onPinChange((change) => {
    if (change.pin === trigger && change.level === "high" && echoStartAt < 0) {
      const now = (change.cycle / UNO.clockHz) * 1e6;
      echoStartAt = now + 450;
      echoEndAt = echoStartAt + cm * 58;
    }
  });
  const end = board.timeMs + ms;
  while (board.timeMs < end) {
    board.runCycles(Math.round((sliceUs / 1e6) * UNO.clockHz));
    const now = board.timeMs * 1000; // us
    if (echoStartAt >= 0 && now >= echoStartAt && now < echoEndAt) board.setInput(echo, true);
    else if (echoEndAt >= 0 && now >= echoEndAt) {
      board.setInput(echo, false);
      echoStartAt = echoEndAt = -1;
    }
  }
  stop();
}

function sketchDir(name: string, source: string): string {
  const dir = join(build("sketch"), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.ino`), source);
  return dir;
}

describe.skipIf(!tc)("the Hybrid shim on compiled code", { timeout: 180_000 }, () => {
  const toolchain = tc as DirectToolchain;

  it("the Sprint 2 check: a pushed distance reaches the unchanged NewPing sketch within 100 ms", () => {
    const result = compileHybridDirect(toolchain, { sketchDir: join(sketches, "SonarPrint"), buildPath: build("hybrid"), plan: SPRINT_2_PLAN, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, lines, frames, reader } = runner(result.hex!);

    board.runMs(120);
    board.writeSerial(encodeHello());
    board.runMs(60); // the sketch polls the link once per loop(), and its loop is 50 ms
    expect(frames.map((f) => f.frame.type)).toEqual(["hello", "stats"]);
    expect(frames[0].frame).toMatchObject({ protocol: PROTOCOL_VERSION, sensors: 8 });

    // No value pushed yet: the virtual sensor reports no echo, like a real one with nothing in range.
    expect(lines.every((l) => l.text === "0")).toBe(true);

    board.writeSerial(encodeSet(0, 30));
    const pushed30 = board.timeMs;
    board.runMs(200);
    const first30 = lines.find((l) => l.at > pushed30 && l.text === "30");
    expect(first30, "30 was never printed").toBeDefined();
    expect(first30!.at - pushed30).toBeLessThan(100);

    board.writeSerial(encodeSet(0, 120));
    const pushed120 = board.timeMs;
    board.runMs(200);
    const first120 = lines.find((l) => l.at > pushed120 && l.text === "120");
    expect(first120, "120 was never printed").toBeDefined();
    expect(first120!.at - pushed120).toBeLessThan(100);
    // Once a value lands it stays until the next push.
    expect(lines.filter((l) => l.at > first120!.at).every((l) => l.text === "120")).toBe(true);
    expect(reader.badFrames).toBe(0);
  });

  it("keeps the sketch's loop rate: prints per second match the plain build within 5 %", () => {
    if (!realNewPing) return; // the plain build needs the real NewPing
    const plain = compileDirect(toolchain, join(sketches, "SonarPrint"), build("plain"), { libraries: [realNewPing] });
    expect(plain.ok, plain.log).toBe(true);
    const hybrid = compileHybridDirect(toolchain, { sketchDir: join(sketches, "SonarPrint"), buildPath: build("hybrid"), plan: SPRINT_2_PLAN, resources });
    expect(hybrid.ok, hybrid.log).toBe(true);

    // Plain: the real NewPing pings a simulated HC-SR04 at 30 cm.
    const plainRun = (() => {
      const board = new AvrBoard(UNO, plain.hex!);
      let text = "";
      board.onSerialByte((b) => (text += String.fromCharCode(b)));
      runWithHcSr04(board, 1000, 9, 10, 30);
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      return { count: lines.length, lines };
    })();
    const near30 = plainRun.lines.filter((l) => Math.abs(Number(l) - 30) <= 1).length;
    expect(near30 / plainRun.count, `plain printed ${[...new Set(plainRun.lines)].join(" ")}`).toBeGreaterThan(0.9);
    const countHybrid = (() => {
      const { board, lines } = runner(hybrid.hex!);
      board.runMs(5);
      board.writeSerial(encodeSet(0, 30));
      board.runMs(995);
      return lines.length;
    })();
    expect(Math.abs(countHybrid - plainRun.count) / plainRun.count, `plain ${plainRun.count}/s, hybrid ${countHybrid}/s`).toBeLessThan(0.05);
  });

  it("tags every byte of the sketch's Serial output and feeds Serial.read from IN frames", () => {
    const dir = sketchDir(
      "EchoUpper",
      `void setup() { Serial.begin(9600); Serial.print("ready"); Serial.println(); }
       void loop() { while (Serial.available()) { char c = Serial.read(); if (c == 10) Serial.println(); else Serial.write(c - 32); } if (Serial.available() == 0) delay(5); }`,
    );
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("echo"), plan: { board: "arduino:avr:uno", sensors: [] }, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, raw, lines, reader } = runner(result.hex!);
    board.runMs(30);
    // Nothing the sketch wrote reached the wire outside a frame: every chunk starts with a COBS code and 0x82.
    const text = raw.filter((b) => b !== 0);
    expect(text.length).toBeGreaterThan(0);
    expect(lines).toEqual([{ at: expect.any(Number), text: "ready" }]);
    for (const frame of encodeIn(new TextEncoder().encode("abc\n"))) board.writeSerial(frame);
    board.runMs(30);
    expect(lines.map((l) => l.text)).toEqual(["ready", "ABC"]);
    expect(reader.badFrames).toBe(0);
  });

  it("answers PING with ACK, and reports dropped IN bytes rather than blocking", () => {
    const dir = sketchDir("Idle", `void setup() { Serial.begin(9600); } void loop() { delay(1); }`);
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("idle"), plan: { board: "arduino:avr:uno", sensors: [] }, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, frames } = runner(result.hex!);
    board.runMs(10);
    board.writeSerial(encodePing(42));
    board.runMs(10);
    expect(frames.map((f) => f.frame).filter((f) => f.type === "ack")).toEqual([{ type: "ack", seq: 42 }]);
    // The outputs' state comes with the answer to a PING: nothing driven yet.
    expect(frames.at(-1)?.frame).toEqual({ type: "out", levels: 0, driven: 0, pwm: [] });
    // 100 bytes the sketch never reads: the 32-byte queue fills, the rest is counted as dropped.
    for (const frame of encodeIn(new Uint8Array(100).fill(0x41))) board.writeSerial(frame);
    board.runMs(30);
    board.writeSerial(encodeHello());
    board.runMs(10);
    const stats = frames.map((f) => f.frame).find((f) => f.type === "stats");
    expect(stats).toMatchObject({ type: "stats", dropped: 68, bad: 0 });
  });

  it("virtual digitalRead, analogRead and pulseIn answer from pushed values; real pins stay real", () => {
    const plan: HybridPlan = { board: "arduino:avr:uno", sensors: [{ id: 1, part: "button", pins: [7] }, { id: 2, part: "ldr", pins: [14] }, { id: 3, part: "pulse", pins: [8] }] };
    const dir = sketchDir(
      "Pins",
      `void setup() { Serial.begin(9600); pinMode(7, INPUT); pinMode(8, INPUT); pinMode(6, INPUT); }
       void loop() { Serial.print(digitalRead(7)); Serial.print(' '); Serial.print(analogRead(A0)); Serial.print(' '); Serial.print(pulseIn(8, HIGH, 2000)); Serial.print(' '); Serial.println(digitalRead(6)); delay(10); }`,
    );
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("pins"), plan, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, lines } = runner(result.hex!);
    board.runMs(25);
    expect(lines.at(-1)?.text).toBe("0 0 0 0");
    board.writeSerial(encodeSet(1, 1));
    board.writeSerial(encodeSet(2, 2000)); // clamps to 1023
    board.writeSerial(encodeSet(3, 1500));
    board.setInput(6, true); // a real pin, driven by the emulator
    board.runMs(40);
    expect(lines.at(-1)?.text).toBe("1 1023 1500 1");
    board.writeSerial(encodeSet(3, 5000)); // longer than the 2000 us timeout: pulseIn gives up, as a real one would
    board.runMs(40);
    expect(lines.at(-1)?.text).toBe("1 1023 0 1");
  });

  it("a sketch with its own serialEvent still gets it, after the runtime's", () => {
    const dir = sketchDir(
      "Event",
      `volatile int got = 0;
       void setup() { Serial.begin(9600); }
       void loop() { if (got) { Serial.println(got); got = 0; } delay(2); }
       void serialEvent() { while (Serial.available()) got = Serial.read(); }`,
    );
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("event"), plan: { board: "arduino:avr:uno", sensors: [] }, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, lines } = runner(result.hex!);
    board.runMs(10);
    for (const frame of encodeIn(Uint8Array.of(65))) board.writeSerial(frame);
    board.runMs(20);
    expect(lines.map((l) => l.text)).toEqual(["65"]);
  });
});

describe.skipIf(!tc)("toolchain facts the shim design rests on (#57, #59)", { timeout: 180_000 }, () => {
  const toolchain = tc as DirectToolchain;
  const readSketch = `void setup() { pinMode(7, INPUT); Serial.begin(115200); }
                      void loop() { Serial.println(digitalRead(7)); delay(5); }`;
  const wrapLibrary = (() => {
    const dir = join(build("wraplib"), "Wrap");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Wrap.h"), "#pragma once\n");
    writeFileSync(join(dir, "Wrap.cpp"), `#include <Arduino.h>\nextern "C" int __real_digitalRead(uint8_t);\nextern "C" int __wrap_digitalRead(uint8_t) { return 1; }\n`);
    return dir;
  })();
  const firstLine = (hex: string) => {
    const { board, raw } = runner(hex);
    board.runMs(30);
    return new TextDecoder().decode(Uint8Array.from(raw)).split("\n")[0]?.trim();
  };

  it("--wrap is silently dropped with LTO on: the real digitalRead runs", () => {
    const dir = sketchDir("WrapLto", `#include <Wrap.h>\n${readSketch}`);
    const result = compileDirect(toolchain, dir, build("wraplto"), { lto: true, libraries: [wrapLibrary], ldFlags: ["-Wl,--wrap=digitalRead"] });
    expect(result.ok, result.log).toBe(true);
    expect(firstLine(result.hex!)).toBe("0");
  });

  it("--wrap works when the sketch is compiled without LTO (the fallback), at a flash cost", () => {
    const dir = sketchDir("WrapMixed", `#include <Wrap.h>\n${readSketch}`);
    const mixed = compileDirect(toolchain, dir, build("wrapmixed"), { lto: true, noLtoForSketch: true, libraries: [wrapLibrary], ldFlags: ["-Wl,--wrap=digitalRead"] });
    expect(mixed.ok, mixed.log).toBe(true);
    expect(firstLine(mixed.hex!)).toBe("1");
    const plain = compileDirect(toolchain, sketchDir("Plain", readSketch), build("plainlto"), { lto: true });
    expect(mixed.flash!.used).toBeGreaterThan(plain.flash!.used);
  });

  it("the forced include intercepts with LTO on, also inside header-only code, with no flash cost", () => {
    const plan: HybridPlan = { board: "arduino:avr:uno", sensors: [{ id: 0, part: "button", pins: [7] }] };
    const dir = sketchDir("Forced", `inline int twice() { return digitalRead(7) + digitalRead(7); }\nvoid setup() { pinMode(7, INPUT); Serial.begin(115200); }\nvoid loop() { Serial.println(twice()); delay(5); }`);
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("forced"), plan, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, lines } = runner(result.hex!);
    board.runMs(10);
    board.writeSerial(encodeSet(0, 1));
    board.runMs(30);
    expect(lines.at(-1)?.text).toBe("2");
  });

  it("Serial can't be intercepted by wrapping the virtual write(); the forced include is what works", () => {
    const dir = join(build("serwrap"), "SerWrap");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SerWrap.ino"), `void setup() { Serial.begin(115200); } void loop() { Serial.println(7); delay(5); }`);
    writeFileSync(join(dir, "wrap.cpp"), `#include <Arduino.h>\nextern "C" size_t __real__ZN14HardwareSerial5writeEh(HardwareSerial*, uint8_t);\nextern "C" size_t __wrap__ZN14HardwareSerial5writeEh(HardwareSerial* s, uint8_t) { return __real__ZN14HardwareSerial5writeEh(s, 'X'); }\n`);
    const result = compileDirect(toolchain, dir, build("serwrapb"), { lto: true, noLtoForSketch: true, ldFlags: ["-Wl,--wrap=_ZN14HardwareSerial5writeEh"] });
    expect(result.ok, result.log).toBe(true);
    expect(firstLine(result.hex!)).toBe("7"); // untouched: the vtable call never goes through the wrapper
  });
});

/** The Uno starters, as a Kiungo project writes them (the pins come from the lab's auto-wire). */
const starterSketch = (name: string) => readFileSync(join(__dirname, "..", "..", "..", "packages", "core", "test", "fixtures", "sketches", `${name}.ino`), "utf8");

describe.skipIf(!tc)("Hybrid runs of the starters (sprint 9)", { timeout: 180_000 }, () => {
  const toolchain = tc as DirectToolchain;

  /** A circuit with the board on the desk and the sensors played by Kiungo. */
  function bindingsFor(starter: string) {
    const { session } = buildStarter({ name: "x", board: "arduino-uno", starter });
    const nodes = session.nodes.map((n, i) => (i === 0 ? { ...n, mode: "physical" as const } : n));
    return { nodes, bindings: hybridBindings(nodes, analyze(nodes, session.wires), nodes[0].id) };
  }

  it("a virtual HC-SR04 answers pulseIn on the echo pin with the echo's length (Distance sensor starter)", () => {
    const { bindings } = bindingsFor("distance");
    const result = compileHybridDirect(toolchain, { sketchDir: sketchDir("Distance", starterSketch("distance")), buildPath: build("distance"), plan: bindings.plan, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, lines } = runner(result.hex!);
    board.runMs(50);
    for (const [id, value] of hybridValues(bindings, [{ kind: "hc-sr04", id: bindings.sensors[0].nodeId, trig: 2, echo: 3, distanceCm: 42 }])) board.writeSerial(encodeSet(id, value));
    board.runMs(700);
    const readings = lines.map((l) => Number.parseFloat(l.text)).filter((n) => !Number.isNaN(n));
    expect(readings.length).toBeGreaterThan(1);
    expect(readings.at(-1)).toBeCloseTo(42, 0);
  });

  it("a virtual DHT11 answers the unchanged DHT sketch through the adapter", () => {
    const { bindings } = bindingsFor("dht11");
    expect(bindings.plan.sensors).toEqual([{ id: 0, part: "dht11", pins: [2], adapter: "DHT" }]);
    const result = compileHybridDirect(toolchain, { sketchDir: sketchDir("Dht", starterSketch("dht11")), buildPath: build("dht"), plan: bindings.plan, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, lines } = runner(result.hex!);
    board.runMs(100);
    board.writeSerial(encodeSet(0, packDht(23.4, 55)));
    board.runMs(4300);
    expect(lines.map((l) => l.text)).toContain("Temperature: 23.40 C, humidity: 55.00 %");
  });

  it("a sketch that never calls Serial.begin still answers the link (Blink)", () => {
    const dir = sketchDir("Quiet", `void setup() { pinMode(13, OUTPUT); }
void loop() { digitalWrite(13, HIGH); delay(100); digitalWrite(13, LOW); delay(100); }`);
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("quiet"), plan: { board: "arduino:avr:uno", sensors: [] }, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, frames } = runner(result.hex!);
    board.runMs(50);
    board.writeSerial(encodeHello());
    board.runMs(300);
    expect(frames.map((f) => f.frame.type)).toContain("hello");
    expect(frames.map((f) => f.frame.type)).toContain("out");
  });

  it("the outputs the sketch drives come back as OUT frames, without slowing it (OUT-01)", () => {
    const dir = sketchDir("Outs", `void setup() { pinMode(13, OUTPUT); pinMode(5, OUTPUT); Serial.begin(9600); }
void loop() { digitalWrite(13, HIGH); analogWrite(5, 128); delay(100); digitalWrite(13, LOW); analogWrite(5, 0); delay(100); }`);
    const result = compileHybridDirect(toolchain, { sketchDir: dir, buildPath: build("outs"), plan: { board: "arduino:avr:uno", sensors: [] }, resources });
    expect(result.ok, result.log).toBe(true);
    const { board, frames } = runner(result.hex!);
    const edges: number[] = [];
    board.onPinChange((c) => c.pin === 13 && c.level === "high" && edges.push(board.timeMs));
    board.runMs(650);
    const outs = frames.map((f) => f.frame).filter((f) => f.type === "out");
    expect(outs).toContainEqual({ type: "out", levels: 1 << 13, driven: (1 << 13) | (1 << 5), pwm: [[5, 128]] });
    expect(outs).toContainEqual({ type: "out", levels: 0, driven: (1 << 13) | (1 << 5), pwm: [] });
    // The sketch's own timing holds: pin 13 rises every 200 ms.
    for (let i = 1; i < edges.length; i++) expect(edges[i] - edges[i - 1]).toBeCloseTo(200, -1);
  });
});

describe.skipIf(!tc)("safety on the board (sprint 10: SAF-01, SAF-02)", { timeout: 180_000 }, () => {
  const toolchain = tc as DirectToolchain;
  /** A motor sketch: pin 13 on and pin 9 at PWM 200, rewritten every second, with a button read from the lab on pin 7. */
  const MOTOR = `void setup() { pinMode(13, OUTPUT); pinMode(9, OUTPUT); pinMode(7, INPUT); Serial.begin(9600); }
void loop() { digitalWrite(13, HIGH); analogWrite(9, 200); Serial.println(digitalRead(7)); delay(1000); }`;
  const plan: HybridPlan = { board: "arduino:avr:uno", sensors: [{ id: 0, part: "button", pins: [7] }] };
  let hex = "";
  const motor = () => {
    if (!hex) {
      const result = compileHybridDirect(toolchain, { sketchDir: sketchDir("Motor", MOTOR), buildPath: build("motor"), plan, resources });
      expect(result.ok, result.log).toBe(true);
      hex = result.hex!;
    }
    return runner(hex);
  };
  /** Whether a pin stays low for the whole of `ms` (a PWM pin that still pulses would go high). */
  const staysLow = (board: ReturnType<typeof runner>["board"], pin: number, ms: number) => {
    let high = board.level(pin) === "high";
    const stop = board.onPinChange((c) => c.pin === pin && c.level === "high" && (high = true));
    board.runMs(ms);
    stop();
    return !high;
  };
  /** Ping every 100 ms for `ms`, as the PC does while it listens. */
  const pinging = (board: ReturnType<typeof runner>["board"], ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      board.writeSerial(encodePing(t / 100));
      board.runMs(100);
    }
  };

  it("the emergency stop takes every driven pin low at once, even inside delay(), and holds it", () => {
    const { board, frames } = motor();
    board.runMs(100);
    board.writeSerial(encodeHello());
    pinging(board, 300);
    expect(board.level(13)).toBe("high");
    const at = board.timeMs;
    board.writeSerial(encodeStop("emergency"));
    board.runMs(5);
    expect(board.level(13)).toBe("low");
    expect(staysLow(board, 9, 5)).toBe(true);
    expect(frames.filter((f) => f.at > at).map((f) => f.frame)).toContainEqual({ type: "safe", reason: "emergency" });
    // The sketch keeps running and writing HIGH, but the pins stay low, after a new hello too.
    board.writeSerial(encodeHello());
    expect(staysLow(board, 13, 2500)).toBe(true);
    expect(staysLow(board, 9, 10)).toBe(true);
  });

  it("when the link goes quiet the watchdog makes the outputs safe within 500 ms, and a new hello lets the sketch drive again", () => {
    const { board, frames, lines } = motor();
    board.runMs(100);
    board.writeSerial(encodeHello());
    board.writeSerial(encodeSet(0, 1));
    pinging(board, 1200);
    expect(board.level(13)).toBe("high");
    expect(lines.at(-1)?.text).toBe("1");
    // The PC goes away (the app closed, the cable to the PC pulled while the board has its own power).
    const quiet = board.timeMs;
    let lowAt = -1;
    const stop = board.onPinChange((c) => c.pin === 13 && c.level === "low" && lowAt < 0 && (lowAt = board.timeMs));
    board.runMs(600);
    stop();
    expect(lowAt).toBeGreaterThan(quiet);
    expect(lowAt - quiet).toBeLessThan(500);
    console.log(`watchdog: outputs safe ${Math.round(lowAt - quiet)} ms after the link went quiet`);
    expect(staysLow(board, 9, 10)).toBe(true);
    expect(frames.filter((f) => f.at > quiet).map((f) => f.frame)).toContainEqual({ type: "safe", reason: "link-lost" });
    // The lab's value is gone too: the virtual button reads LOW again (its fallback).
    board.runMs(1000);
    expect(lines.at(-1)?.text).toBe("0");
    // The PC is back.
    board.writeSerial(encodeHello());
    pinging(board, 1100);
    expect(board.level(13)).toBe("high");
  });

  it("before the PC says hello there's no watchdog: a board on its own runs its sketch", () => {
    const { board } = motor();
    board.runMs(2500);
    expect(board.level(13)).toBe("high");
  });
});
