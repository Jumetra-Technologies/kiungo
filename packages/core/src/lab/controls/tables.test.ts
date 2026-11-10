import { describe, expect, it } from "vitest";
import { PARTS } from "../../parts";
import { getPinout } from "../pinout";
import {
  ACTUATOR_CONTROLS,
  BOARD_CONTROLS,
  PASSIVE_CONTROLS,
  SENSOR_CONTROLS,
  stripWhen,
} from "./tables";
import type { Control } from "./control";

const all = (): Array<[string, Control]> => [
  ...Object.entries({ ...SENSOR_CONTROLS, ...ACTUATOR_CONTROLS, ...PASSIVE_CONTROLS }).flatMap(
    ([part, list]) => list.map((c) => [part, c] as [string, Control]),
  ),
  ...BOARD_CONTROLS.map((c) => ["board", stripWhen(c)] as [string, Control]),
];

describe("the Inspector's controls", () => {
  it("are for parts the catalog has, and never for boards outside the board list", () => {
    const ids = new Set(PARTS.map((p) => p.id));
    for (const part of Object.keys({
      ...SENSOR_CONTROLS,
      ...ACTUATOR_CONTROLS,
      ...PASSIVE_CONTROLS,
    })) {
      expect(ids.has(part), part).toBe(true);
      expect(getPinout(part).controller, part).toBeFalsy();
    }
  });

  it("each has a unique key per part, and a default inside its own range or options", () => {
    const seen = new Set<string>();
    for (const [part, c] of all()) {
      expect(seen.has(`${part}:${c.key}`), `${part}:${c.key}`).toBe(false);
      seen.add(`${part}:${c.key}`);
      if (c.kind === "number") {
        expect(c.default, c.key).toBeGreaterThanOrEqual(c.min);
        expect(c.default, c.key).toBeLessThanOrEqual(c.max);
        expect(c.step).toBeGreaterThan(0);
      }
      if (c.kind === "select") expect(c.options.map((o) => o.id)).toContain(c.default);
    }
  });

  it("board settings appear only when a part that uses them is on the board", () => {
    const delay = BOARD_CONTROLS.find((c) => c.key === "delayMs")!;
    const warn = BOARD_CONTROLS.find((c) => c.key === "warnCm")!;
    expect(warn.when(new Set(["hc-sr04"]))).toBe(true);
    expect(warn.when(new Set(["led"]))).toBe(false);
    expect(typeof delay.when(new Set())).toBe("boolean");
    expect(stripWhen(warn)).not.toHaveProperty("when");
  });
});
