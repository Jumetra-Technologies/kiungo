import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { BREADBOARD, BREADBOARD_FULL, BREADBOARD_MINI, PROTOTYPING } from "./model";

describe("breadboard models", () => {
  it.each([BREADBOARD, BREADBOARD_FULL, BREADBOARD_MINI])(
    "$name is complete, consistent and wireable",
    (part) => {
      expectWellMadePart(part);
      expect(part.group).toBe("prototyping");
    },
  );

  it("every hole is a pin the lab wires: 400, 830 and 170 of them", () => {
    expect(getPinout(BREADBOARD.id).pins).toHaveLength(400);
    expect(getPinout(BREADBOARD_FULL.id).pins).toHaveLength(830);
    expect(getPinout(BREADBOARD_MINI.id).pins).toHaveLength(170);
  });

  it("the catalog lists the half-size board first, as the one most people own", () => {
    expect(PROTOTYPING.map((p) => p.id)).toEqual([
      "breadboard",
      "breadboard-full",
      "breadboard-mini",
    ]);
  });
});
