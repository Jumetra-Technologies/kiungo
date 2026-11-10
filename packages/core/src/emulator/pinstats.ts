/**
 * What each pin of the emulated board is doing, measured the way a logic
 * analyser would (DBG-01): its level now, how much of the time it's high
 * (PWM brightness, motor speed), how fast it toggles (a tone), and how long
 * its last high pulse was (a servo's position). All in simulated cycles, so
 * the same program reads the same however fast the computer is.
 */

import type { PinChange, PinLevel } from "./avr";

export interface PinReading {
  /** The Arduino pin number. */
  pin: number;
  /** "high"/"low" when the program drives it, "input"/"pullup" when it reads it. */
  level: PinLevel;
  /** Share of the window the pin was high, 0 to 1. */
  duty: number;
  /** Rising edges per second over the window: a tone's pitch. 0 when steady. */
  hz: number;
  /** The last complete high pulse, in microseconds, or null. Servos read this. */
  pulseUs: number | null;
}

interface Track {
  level: PinLevel;
  since: number;
  highCycles: number;
  rises: number;
  riseAt: number | null;
  pulseCycles: number | null;
}

const isHigh = (l: PinLevel) => l === "high";

export class PinStats {
  private readonly tracks = new Map<number, Track>();
  private windowStart: number;

  constructor(
    private readonly clockHz: number,
    pins: readonly number[],
    start = 0,
  ) {
    this.windowStart = start;
    for (const pin of pins)
      this.tracks.set(pin, {
        level: "input",
        since: start,
        highCycles: 0,
        rises: 0,
        riseAt: null,
        pulseCycles: null,
      });
  }

  record(change: PinChange): void {
    const t = this.tracks.get(change.pin);
    if (!t) return;
    if (isHigh(t.level)) t.highCycles += change.cycle - Math.max(t.since, this.windowStart);
    const rising = !isHigh(t.level) && isHigh(change.level);
    const falling = isHigh(t.level) && !isHigh(change.level);
    if (rising) {
      t.rises++;
      t.riseAt = change.cycle;
    }
    if (falling && t.riseAt !== null) t.pulseCycles = change.cycle - t.riseAt;
    t.level = change.level;
    t.since = change.cycle;
  }

  /** Readings for the window that ends at `now`, then start a new window. */
  take(now: number): PinReading[] {
    const span = Math.max(1, now - this.windowStart);
    const out: PinReading[] = [];
    for (const [pin, t] of this.tracks) {
      const high = t.highCycles + (isHigh(t.level) ? now - Math.max(t.since, this.windowStart) : 0);
      out.push({
        pin,
        level: t.level,
        duty: Math.min(1, high / span),
        // One edge in a short window is a switch, not a tone.
        hz: t.rises >= 2 ? (t.rises / span) * this.clockHz : 0,
        pulseUs: t.pulseCycles === null ? null : (t.pulseCycles / this.clockHz) * 1_000_000,
      });
      t.highCycles = 0;
      t.rises = 0;
    }
    this.windowStart = now;
    return out;
  }
}
