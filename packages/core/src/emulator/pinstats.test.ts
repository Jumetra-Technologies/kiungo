// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNO } from "../boards";
import { AvrBoard } from "./";
import { Peripherals } from "./peripherals";
import { PinStats } from "./pinstats";

const hex = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures", "sketches", `${name}-uno.hex`), "utf8");

function run(name: string) {
  const board = new AvrBoard(UNO, hex(name));
  let serial = "";
  board.onSerialByte((b) => (serial += String.fromCharCode(b)));
  const peripherals = new Peripherals(board);
  return { board, peripherals, serial: () => serial };
}

describe("what the pins do, measured (DBG-01)", () => {
  it("a servo sweep: the pulse width follows the angle (Servo library)", () => {
    const { board } = run("servo");
    const stats = new PinStats(UNO.clockHz, [3]);
    board.onPinChange((c) => stats.record(c));
    board.runMs(100);
    stats.take(board.cycles);
    // The sweep starts at 0°: 544 µs is the Servo library's 0°.
    board.runMs(60);
    const start = stats.take(board.cycles)[0];
    expect(start!.pulseUs).toBeGreaterThan(540);
    expect(start!.pulseUs).toBeLessThan(700);
    // 15 ms per degree: after 1.5 s it's near 100°.
    board.runMs(1400);
    stats.take(board.cycles);
    board.runMs(60);
    const later = stats.take(board.cycles)[0];
    expect(later!.pulseUs).toBeGreaterThan(1500);
    // A servo pulse every 20 ms: 50 Hz.
    expect(later!.hz).toBeCloseTo(50, -1);
  }, 60_000);

  it("a tone() melody: the pin's pitch is each note's", () => {
    const { board } = run("melody");
    const stats = new PinStats(UNO.clockHz, [8]);
    board.onPinChange((c) => stats.record(c));
    const heard: number[] = [];
    for (let i = 0; i < 4; i++) {
      board.runMs(50);
      stats.take(board.cycles);
      board.runMs(100);
      heard.push(Math.round(stats.take(board.cycles)[0]!.hz));
      board.runMs(100);
    }
    expect(heard[0]).toBeCloseTo(262, -1);
    expect(heard[1]).toBeCloseTo(330, -1);
    expect(heard[2]).toBeCloseTo(392, -1);
    expect(heard[3]).toBeCloseTo(523, -1);
  }, 60_000);

  it("blink: duty is the share of time high", () => {
    const board = new AvrBoard(
      UNO,
      readFileSync(join(__dirname, "../../test/fixtures", "blink-uno.hex"), "utf8"),
    );
    const stats = new PinStats(UNO.clockHz, [13]);
    board.onPinChange((c) => stats.record(c));
    board.runMs(4000);
    const r = stats.take(board.cycles)[0];
    expect(r!.duty).toBeCloseTo(0.5, 1);
    // On for a second, off for a second: 0.5 Hz, far below anything audible.
    expect(r!.hz).toBeCloseTo(0.5, 1);
  }, 30_000);
});
