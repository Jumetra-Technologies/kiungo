// @vitest-environment node
import { describe, expect, it } from "vitest";
import { seeded } from "./random";

describe("seeded random numbers", () => {
  it("gives the same sequence for the same seed and a different one for another", () => {
    const a = seeded(42),
      b = seeded(42),
      c = seeded(43);
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
