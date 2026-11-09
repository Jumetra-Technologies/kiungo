import { describe, expect, it } from "vitest";
import { BindingSchema, BoardTargetSchema, BuildProfileSchema } from "./binding";

describe("BindingSchema", () => {
  it.each(["virtual", "physical", "simulator", "hybrid"])("accepts %s", (value) => {
    expect(BindingSchema.parse(value)).toBe(value);
  });

  it.each(["", "Virtual", "real", 3, null, undefined])("rejects %j", (value) => {
    expect(BindingSchema.safeParse(value).success).toBe(false);
  });
});

describe("BoardTargetSchema", () => {
  it("accepts emulated and real only", () => {
    expect(BoardTargetSchema.safeParse("emulated").success).toBe(true);
    expect(BoardTargetSchema.safeParse("real").success).toBe(true);
    expect(BoardTargetSchema.safeParse("hybrid").success).toBe(false);
  });
});

describe("BuildProfileSchema", () => {
  it("accepts the three INJ-05 profiles only", () => {
    for (const profile of ["simulation", "hybrid", "ship"]) {
      expect(BuildProfileSchema.safeParse(profile).success).toBe(true);
    }
    expect(BuildProfileSchema.safeParse("debug").success).toBe(false);
  });
});
