import { describe, expect, it } from "vitest";
import { findDuplicates } from "./util";

describe("findDuplicates", () => {
  it("returns nothing for unique values", () => {
    expect(findDuplicates(["a", "b", "c"])).toEqual([]);
  });

  it("returns nothing for an empty list", () => {
    expect(findDuplicates([])).toEqual([]);
  });

  it("reports each repeated value once, however often it repeats", () => {
    expect(findDuplicates(["a", "b", "a", "a", "c", "b"])).toEqual(["a", "b"]);
  });
});
