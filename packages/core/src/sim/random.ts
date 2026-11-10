/**
 * Seeded random numbers (EMU-04).
 *
 * Every random value in a simulation (sensor noise, random placement, a
 * floating analog pin read for randomSeed) comes from one of these, so the
 * same seed always gives the same run. Math.random is refused by lint in the
 * emulator and simulation code.
 */

export interface Random {
  /** A number in [0, 1). */
  next(): number;
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number;
  /** A normally distributed number (Box-Muller), for sensor noise. */
  gaussian(mean?: number, sd?: number): number;
  /** The generator's state, to save in a run record and resume from. */
  readonly state: number;
}

/** mulberry32: small, fast, and good enough for simulation (not for security). */
export function seeded(seed: number): Random {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    gaussian: (mean = 0, sd = 1) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    get state() {
      return a;
    },
  };
}
