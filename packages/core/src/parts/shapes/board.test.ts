import { describe, expect, it } from "vitest";
import type { Solid } from "../types";
import {
  flatLegs,
  header,
  maleHeader,
  mountHole,
  pads,
  pcb,
  pinRow,
  silk,
  wire,
  SOLDER_STUB,
} from "./board";
import { MATERIAL, PCB_TOP, shade } from "./materials";

type Box = Extract<Solid, { kind: "box" }>;
type Pins = Extract<Solid, { kind: "pins" }>;

describe("board shapes", () => {
  it("a PCB is a soldermask box with a darker edge unless one is given", () => {
    expect(pcb(68.6, 53.4, "#00878f")).toMatchObject({
      kind: "box",
      id: "pcb",
      w: 68.6,
      h: 53.4,
      d: 1.6,
      side: shade("#00878f", 0.55),
      radius: 1.5,
      finish: "soldermask",
    });
    expect(pcb(10, 10, "#111111", "#222222", 0)).toMatchObject({ side: "#222222", radius: 0 });
  });

  it("a female header is as long as its pins at 0.1 inch, along the way it runs", () => {
    expect(header({ x: 0, y: 0, count: 8, dir: "x" })).toMatchObject({
      w: 8 * 2.54,
      h: 2.54,
      z: PCB_TOP,
      holes: { count: 8, rows: 1 },
    });
    expect(header({ x: 0, y: 0, count: 3, dir: "y", rows: 2 })).toMatchObject({
      w: 2 * 2.54,
      h: 3 * 2.54,
    });
  });

  it("a row of male pins is gold and stands up by default", () => {
    expect(pinRow({ x: 1, y: 2, count: 6, dir: "x" })).toEqual({
      kind: "pins",
      x: 1,
      y: 2,
      count: 6,
      pitch: 2.54,
      dir: "x",
      len: 6,
      rows: 1,
      z: undefined,
      finish: "gold",
    });
  });

  it("a breadboard-style header hangs under the board, with solder joints on top", () => {
    const solids = maleHeader({ x: 0, y: 0, count: 3, dir: "x" });
    const plastic = solids[0] as Box;
    expect((plastic.z ?? 0) + plastic.d).toBeCloseTo(0); // under the board's base
    const pins = solids[1] as Pins;
    expect((pins.z ?? 0) + pins.len).toBeCloseTo(PCB_TOP + SOLDER_STUB);
    expect(solids.filter((s) => s.kind === "dome")).toHaveLength(3);
  });

  it("a standing header keeps its plastic on the board and its pins up", () => {
    const [plastic, pins] = maleHeader({
      x: 0,
      y: 0,
      count: 3,
      dir: "x",
      rows: 1,
      below: false,
    }) as [Box, Pins];
    expect(plastic.z).toBe(PCB_TOP);
    expect(pins.len).toBeGreaterThan(0);
  });

  it("silkscreen text, holes, legs, leads and pads", () => {
    expect(silk({ x: 1, y: 2, text: "UNO" })).toEqual({
      kind: "text",
      x: 1,
      y: 2,
      text: "UNO",
      size: 1.4,
      color: MATERIAL.silk,
    });
    expect(silk({ x: 0, y: 0, text: "R", extra: { anchor: "middle" } })).toMatchObject({
      anchor: "middle",
    });
    expect(mountHole(3, 4)).toMatchObject({
      kind: "disc",
      cx: 3,
      cy: 4,
      r: 1.6,
      ring: { color: MATERIAL.gold },
    });
    const legs = flatLegs({ x: 10, y: 5, count: 4, len: 8 }) as Box[];
    expect(legs.map((l) => l.x + l.w / 2)).toEqual(
      [10, 12.54, 15.08, 17.62].map((x) => expect.closeTo(x, 6)),
    );
    expect(legs.every((l) => l.h === 8 && l.top === MATERIAL.tin)).toBe(true);
    expect(wire({ x: 0, y: 0, w: 10, h: 0.6, color: "#ff0000" })).toMatchObject({
      d: 0.6,
      radius: 0.3,
      side: shade("#ff0000", 0.7),
    });
    const row = pads({ x: 1, y: 2, count: 3, dir: "y" });
    expect(row.map((p) => (p.kind === "disc" ? [p.cx, p.cy] : null))).toEqual([
      [1, 2],
      [1, 4.54],
      [1, 7.08],
    ]);
  });
});
