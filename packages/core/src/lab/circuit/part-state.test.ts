import { describe, expect, it } from "vitest";
import { getPinout } from "../pinout";
import { fault, newPartState, onBoard, type PinView } from "./part-state";

const led = { id: "l", partId: "led", label: "LED", x: 0, y: 0, mode: "virtual" as const };

describe("a part's state while its pins are checked", () => {
  it("starts unpowered, ungrounded and undriven", () => {
    const s = newPartState(led, getPinout("led"), "LED", new Set(["A"]));
    expect(s).toMatchObject({
      supplyV: null,
      poweredByRail: false,
      grounded: false,
      driven: false,
      driveV: null,
      seriesOhms: 0,
      links: [],
      faults: [],
    });
  });

  it("faults are the part's, keyed by what's wrong, with other parts and wires when given", () => {
    const s = newPartState(led, getPinout("led"), "LED", new Set());
    fault(s, { severity: "error", key: "held-low:A", title: "t", detail: "d" });
    fault(s, {
      severity: "tip",
      key: "x",
      title: "t2",
      detail: "d2",
      extraNodes: ["uno"],
      netWires: ["w1"],
    });
    expect(s.faults).toEqual([
      { id: "held-low:A:l", severity: "error", title: "t", detail: "d", nodes: ["l"], wires: [] },
      { id: "x:l", severity: "tip", title: "t2", detail: "d2", nodes: ["l", "uno"], wires: ["w1"] },
    ]);
  });

  it("a pin is on a board only with the board, its pin and its pinout", () => {
    const base = {
      pin: getPinout("led").pins[0]!,
      net: { id: "n", pins: [], wires: [], kind: "signal" as const, label: "13" },
      boardName: "",
      isWired: true,
    };
    expect(onBoard(base as PinView)).toBe(false);
    expect(
      onBoard({
        ...base,
        boardRef: { node: "uno", pin: "D13" },
        boardPin: getPinout("arduino-uno").pins[0]!,
        board: getPinout("arduino-uno"),
      }),
    ).toBe(true);
    expect(
      onBoard({ ...base, boardRef: { node: "uno", pin: "D13" }, board: getPinout("arduino-uno") }),
    ).toBe(false);
  });
});
