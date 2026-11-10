/**
 * Paces an emulated board against the wall clock, in slices, so the worker
 * stays responsive and the board runs at real time when the computer can
 * keep up (EMU-01).
 *
 * The wall clock only decides how many cycles to run next; it never enters
 * the board's state, so a run is still decided by cycles alone (EMU-04).
 */
import type { AvrBoard } from "./avr";

export interface PacerOptions {
  /** Longest stretch of simulated time to run before yielding, in ms. */
  sliceMs?: number;
  /** How often to report speed, in ms of wall time. */
  reportEveryMs?: number;
  /** Wall clock in ms; tests pass their own. */
  now?: () => number;
  /** How to wait before the next slice; tests pass their own. */
  defer?: (fn: () => void) => void;
  onStatus?: (status: { simMs: number; speedPercent: number }) => void;
  /** After each slice of cycles: the robot's world steps here, in the same simulated time. */
  onSlice?: () => void;
}

// Wall-clock time paces the run only; the simulation itself counts cycles (see the file comment).
const wallClock = () => performance.now();
/**
 * Yields to the event loop without setTimeout's minimum delay: browsers
 * clamp nested setTimeout(0) to 4 ms, which alone would hold a 10 ms slice
 * to about 70 % of real time.
 */
function makeNextTask(): (fn: () => void) => void {
  if (typeof MessageChannel === "undefined") return (fn) => setTimeout(fn, 0);
  const channel = new MessageChannel();
  const queue: Array<() => void> = [];
  channel.port1.onmessage = () => queue.shift()?.();
  return (fn) => {
    queue.push(fn);
    channel.port2.postMessage(null);
  };
}

export class Pacer {
  private running = false;
  private startWall = 0;
  private startCycles = 0;
  private lastReportWall = 0;
  private lastReportCycles = 0;
  private readonly sliceCycles: number;
  private readonly reportEveryMs: number;
  private readonly now: () => number;
  private readonly defer: (fn: () => void) => void;
  private readonly idle: (fn: () => void) => void;

  constructor(
    private readonly board: AvrBoard,
    private readonly options: PacerOptions = {},
  ) {
    this.sliceCycles = Math.round(((options.sliceMs ?? 10) / 1000) * board.board.clockHz);
    this.reportEveryMs = options.reportEveryMs ?? 250;
    this.now = options.now ?? wallClock;
    this.defer = options.defer ?? makeNextTask();
    // Caught up with the clock: sleep instead of spinning, so an idle board doesn't hold a CPU core.
    this.idle = options.defer ?? ((fn) => setTimeout(fn, 1));
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startWall = this.lastReportWall = this.now();
    this.startCycles = this.lastReportCycles = this.board.cycles;
    this.defer(() => this.slice());
  }

  stop(): void {
    this.running = false;
  }

  private slice(): void {
    if (!this.running) return;
    const wall = this.now();
    const clockHz = this.board.board.clockHz;
    // Cycles the board should have run by now at 1x, never more than one slice at a time.
    const due = this.startCycles + Math.floor(((wall - this.startWall) / 1000) * clockHz);
    const behind = due - this.board.cycles;
    if (behind > 0) {
      this.board.runCycles(Math.min(behind, this.sliceCycles));
      this.options.onSlice?.();
    }
    // When the computer can't keep up, run slower than real time instead of piling up a backlog
    // to race through later; the speed report then shows the real percentage.
    if (behind > this.sliceCycles * 10) {
      this.startWall = wall;
      this.startCycles = this.board.cycles;
    }
    if (wall - this.lastReportWall >= this.reportEveryMs) {
      const simMs = ((this.board.cycles - this.lastReportCycles) / clockHz) * 1000;
      const wallMs = wall - this.lastReportWall;
      this.options.onStatus?.({
        simMs: this.board.timeMs,
        speedPercent: Math.round((simMs / wallMs) * 100),
      });
      this.lastReportWall = wall;
      this.lastReportCycles = this.board.cycles;
    }
    const stillBehind = behind > this.sliceCycles;
    (stillBehind ? this.defer : this.idle)(() => this.slice());
  }
}
