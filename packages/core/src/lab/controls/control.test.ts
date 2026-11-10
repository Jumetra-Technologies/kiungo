import { describe, expect, it } from "vitest";
import { SOURCE_AUTO, SOURCE_KEY, SOURCE_SET, num, source } from "./control";

describe("control builders", () => {
  it("a source control picks between the simulated sweep and the value set", () => {
    expect(source("Simulated sweep")).toEqual({
      key: SOURCE_KEY,
      kind: "select",
      label: "Input",
      options: [
        { id: SOURCE_AUTO, label: "Simulated sweep" },
        { id: SOURCE_SET, label: "Set by you" },
      ],
      default: SOURCE_AUTO,
    });
    expect(source("Sweep", "Obstacle set by you")).toMatchObject({
      options: [{}, { id: "set", label: "Obstacle set by you" }],
    });
    expect([SOURCE_KEY, SOURCE_AUTO, SOURCE_SET]).toEqual(["source", "auto", "set"]);
  });

  it("a number control has its range, step, default and unit", () => {
    expect(
      num({
        key: "distanceCm",
        label: "Distance",
        min: 2,
        max: 400,
        step: 1,
        def: 30,
        unit: "cm",
        help: "HC-SR04 range",
      }),
    ).toEqual({
      key: "distanceCm",
      kind: "number",
      label: "Distance",
      min: 2,
      max: 400,
      step: 1,
      default: 30,
      unit: "cm",
      help: "HC-SR04 range",
    });
  });
});
