import { describe, expect, it } from "vitest";
import { L, R, bp, gnd, peripheral, pp, vout } from "./helpers";

describe("pinout helpers", () => {
  it("board pins carry their side and what they can do", () => {
    expect([L, R]).toEqual(["left", "right"]);
    expect(bp("D13", "13", R, ["digital", "led"], { inputOnly: true })).toEqual({
      id: "D13",
      label: "13",
      side: "right",
      fns: ["digital", "led"],
      inputOnly: true,
    });
  });

  it("supply and ground pins say what they are", () => {
    expect(vout("5V", "5V", 5)).toEqual({
      id: "5V",
      label: "5V",
      side: "left",
      fns: ["power"],
      supplies: 5,
      note: "5 V out",
    });
    expect(gnd("GND2", R)).toEqual({
      id: "GND2",
      label: "GND",
      side: "right",
      fns: ["ground"],
      note: "Ground",
    });
  });

  it("a part's pin is required unless it's optional or a load", () => {
    expect(pp("DATA", "DATA", "io").required).toBe(true);
    expect(pp("NC", "NC", "opt").required).toBe(false);
    expect(pp("M+", "M+", "load").required).toBe(false);
    expect(pp("D0", "D0", "out-digital", false, "threshold").required).toBe(false);
  });

  it("a peripheral takes 5 V signals when its logic is 5 V, unless told otherwise", () => {
    expect(peripheral("x", 5, [4.5, 5.5], []).tolerates5V).toBe(true);
    expect(peripheral("y", 3.3, [3, 3.6], []).tolerates5V).toBe(false);
    expect(peripheral("z", 3.3, [3, 5.5], [], true)).toEqual({
      partId: "z",
      controller: false,
      logic: 3.3,
      supply: [3, 5.5],
      tolerates5V: true,
      pins: [],
    });
  });
});
