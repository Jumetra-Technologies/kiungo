import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNO } from "../boards";
import { AvrBoard } from "./avr";
import { Pacer } from "./realtime";

const blink = () =>
  new AvrBoard(UNO, readFileSync(join(__dirname, "../../test/fixtures/blink-uno.hex"), "utf8"));

/** A pacer on a clock and a task queue the test moves by hand. */
function paced(options: { sliceMs?: number } = {}) {
  const board = blink();
  let wall = 0;
  const queue: Array<() => void> = [];
  const statuses: Array<{ simMs: number; speedPercent: number }> = [];
  let slices = 0;
  const pacer = new Pacer(board, {
    ...options,
    now: () => wall,
    defer: (fn) => queue.push(fn),
    reportEveryMs: 100,
    onStatus: (s) => statuses.push(s),
    onSlice: () => slices++,
  });
  const advance = (ms: number) => {
    wall += ms;
    queue.shift()?.();
  };
  return { board, pacer, queue, statuses, advance, slices: () => slices };
}

describe("pacing a board against the clock", () => {
  it("runs nothing until started, and only one slice at a time", () => {
    const { board, pacer, queue, advance } = paced();
    expect(pacer.isRunning).toBe(false);
    expect(queue).toHaveLength(0);
    pacer.start();
    pacer.start(); // a second start doesn't queue a second loop
    expect(pacer.isRunning).toBe(true);
    expect(queue).toHaveLength(1);
    advance(5);
    expect(board.timeMs).toBeCloseTo(5, 0);
    expect(queue).toHaveLength(1);
  });

  it("keeps real time, stepping the world after every slice", () => {
    const { board, pacer, statuses, advance, slices } = paced();
    pacer.start();
    for (let i = 0; i < 30; i++) advance(10);
    expect(board.timeMs).toBeGreaterThan(280);
    expect(board.timeMs).toBeLessThanOrEqual(300);
    expect(slices()).toBeGreaterThanOrEqual(29);
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(statuses.every((s) => s.speedPercent >= 95 && s.speedPercent <= 105)).toBe(true);
  });

  it("runs slower than real time when the computer can't keep up, rather than racing to catch up", () => {
    const { board, pacer, advance } = paced({ sliceMs: 10 });
    pacer.start();
    advance(1000); // a long stall: far more than ten slices behind
    const after = board.timeMs;
    expect(after).toBeLessThanOrEqual(10.5); // one slice, not the whole second
    advance(10);
    expect(board.timeMs - after).toBeLessThanOrEqual(10.5);
  });

  it("stops between slices", () => {
    const { board, pacer, advance } = paced();
    pacer.start();
    advance(10);
    pacer.stop();
    const at = board.timeMs;
    advance(50);
    expect(board.timeMs).toBe(at);
    expect(pacer.isRunning).toBe(false);
  });
});
