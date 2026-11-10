// @vitest-environment node
/**
 * Sprint 1 spike (#51): the emulator runs programs compiled by Arduino CLI,
 * unmodified, with the Uno's real timing.
 *
 * The fixtures were compiled with Arduino CLI 1.5.1, Arduino AVR core 1.8.6
 * and avr-gcc 7.3.0 (the sketches sit beside them).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NANO, UNO, maxSketchBytes } from "../src/boards";
import { AvrBoard, Pacer, type PinChange } from "../src/emulator";
import { seeded } from "../src/sim/random";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("emulated Uno", () => {
  it("runs Blink: pin 13 toggles once a second in simulated time", () => {
    const board = new AvrBoard(UNO, fixture("blink-uno.hex"));
    const changes: PinChange[] = [];
    board.onPinChange((c) => c.pin === 13 && changes.push(c));
    board.runMs(4200);

    const edges = changes.filter((c) => c.level === "high" || c.level === "low");
    // pinMode() drives the pin low first, then loop() starts with HIGH.
    expect(edges.map((c) => c.level)).toEqual(["low", "high", "low", "high", "low", "high"]);
    const ms = edges.slice(1).map((c) => (c.cycle / UNO.clockHz) * 1000);
    // delay(1000) on a real Uno is 1000 ms plus a few microseconds of loop overhead.
    for (let i = 1; i < ms.length; i++) expect(ms[i] - ms[i - 1]).toBeCloseTo(1000, 0);
    expect(board.level(13)).toBe("high");
    expect(board.programBytes).toBe(924);
  }, 30_000);

  it("prints over Serial at 9600 baud with the real character timing", () => {
    const board = new AvrBoard(UNO, fixture("hello-serial-uno.hex"));
    let out = "";
    board.onSerialByte((b) => (out += String.fromCharCode(b)));
    board.runMs(350);
    expect(out.startsWith("Kiungo\r\n0\r\n1\r\n2\r\n")).toBe(true);
    expect(out).not.toContain("4\r\n");
  }, 30_000);

  it("is deterministic: the same program gives the same edges, cycle for cycle", () => {
    const run = () => {
      const board = new AvrBoard(UNO, fixture("blink-uno.hex"));
      const cycles: number[] = [];
      board.onPinChange((c) => cycles.push(c.cycle));
      board.runMs(1100);
      return cycles;
    };
    const first = run();
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(run()).toEqual(first);
  }, 30_000);

  it("has exactly the Uno's limits and refuses a program that doesn't fit", () => {
    expect(maxSketchBytes(UNO)).toBe(32_256);
    expect(UNO.sramBytes).toBe(2048);
    expect(NANO.pins.filter((p) => p.analog)).toHaveLength(6);
    expect(() => new AvrBoard(UNO, new Uint8Array(32_257))).toThrow(/more than the 32,256/);
  });

  it("keeps pace with a test clock and reports the speed", () => {
    const board = new AvrBoard(UNO, fixture("blink-uno.hex"));
    let wall = 0;
    const queue: Array<() => void> = [];
    const statuses: number[] = [];
    const pacer = new Pacer(board, {
      now: () => wall,
      defer: (fn) => queue.push(fn),
      reportEveryMs: 100,
      onStatus: (s) => statuses.push(s.speedPercent),
    });
    pacer.start();
    for (let i = 0; i < 60; i++) {
      wall += 10;
      queue.shift()?.();
    }
    pacer.stop();
    expect(board.timeMs).toBeGreaterThan(550);
    expect(board.timeMs).toBeLessThanOrEqual(600);
    expect(statuses.every((s) => s >= 95 && s <= 105)).toBe(true);
  }, 30_000);
});

describe("seeded random numbers", () => {
  it("gives the same sequence for the same seed and a different one for another", () => {
    const a = seeded(42), b = seeded(42), c = seeded(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("resumes from a saved state", () => {
    const a = seeded(7);
    a.next();
    const resumed = seeded(a.state);
    expect(resumed.next()).toBe(a.next());
  });
});
