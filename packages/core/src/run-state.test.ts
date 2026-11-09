import { describe, expect, it } from "vitest";
import { RunState } from "./run-state";

describe("RunState", () => {
  it("defines the seven RUN-03 states with unique lowercase values", () => {
    const values = Object.values(RunState);
    expect(values).toHaveLength(7);
    expect(new Set(values).size).toBe(7);
    for (const value of values) expect(value).toBe(value.toLowerCase());
  });

  it("starts from idle", () => {
    expect(RunState.Idle).toBe("idle");
  });
});
