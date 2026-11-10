import { describe, expect, expectTypeOf, it } from "vitest";
import { PARTS } from "./index";
import type { Finish, PartGroupId, PartModel, Solid } from "./types";

const GROUPS: PartGroupId[] = ["boards", "prototyping", "sensors", "outputs", "displays", "radios"];
const FINISHES: Finish[] = [
  "soldermask",
  "epoxy",
  "plastic",
  "metal",
  "gold",
  "tin",
  "copper",
  "rubber",
  "glass",
  "clear",
  "ceramic",
  "paper",
];

describe("the part model's shape", () => {
  it("every part is in one of the six groups", () => {
    for (const part of PARTS) expect(GROUPS).toContain(part.group);
  });

  it("every finish a solid asks for is one the renderer has", () => {
    for (const part of PARTS)
      for (const solid of part.solids)
        if ("finish" in solid && solid.finish) expect(FINISHES).toContain(solid.finish);
  });

  it("solids are told apart by their kind", () => {
    expectTypeOf<Extract<Solid, { kind: "box" }>>().toHaveProperty("w");
    expectTypeOf<Extract<Solid, { kind: "cyl" }>>().toHaveProperty("r");
    expectTypeOf<Extract<Solid, { kind: "pins" }>>().toHaveProperty("pitch");
    expectTypeOf<PartModel["canvas"]>().toEqualTypeOf<PartModel["canvas"]>();
  });
});
