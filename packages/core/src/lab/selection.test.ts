import { describe, expect, it } from "vitest";
import { nextSelection } from "./selection";

const sel = (nodes: string[], wire: string | null = null) => ({ nodes, wire });
const pick = (id: string, selected = true) => ({ type: "select", id, selected });

describe("selection on the canvas", () => {
  it("changes nothing for changes that aren't selections", () => {
    expect(nextSelection(sel(["a"]), [{ type: "position", id: "a" }])).toBeNull();
    expect(nextSelection(sel(["a"]), [pick("a")])).toBeNull(); // already selected
  });

  it("adds and removes parts, keeping the order they were picked in", () => {
    expect(nextSelection(sel(["a"]), [pick("b")])).toEqual(sel(["a", "b"]));
    expect(nextSelection(sel(["a", "b"]), [pick("a", false)])).toEqual(sel(["b"]));
  });

  it("a wire is inspected on its own: picking it clears the parts, picking parts clears it", () => {
    expect(nextSelection(sel(["a"]), [], [pick("w1")])).toEqual(sel([], "w1"));
    expect(nextSelection(sel([], "w1"), [pick("a")])).toEqual(sel(["a"], null));
    expect(nextSelection(sel([], "w1"), [], [pick("w1", false)])).toEqual(sel([], null));
    expect(nextSelection(sel([], "w1"), [], [pick("w2", false)])).toBeNull();
  });
});
