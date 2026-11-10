import { describe, expect, it } from "vitest";
import type { Solid } from "../types";
import {
  capacitor,
  led5mm,
  lyingCylinder,
  screwTerminal,
  smd,
  smdLed,
  smdRow,
  tactileButton,
  trimPot,
} from "./components";
import { PCB_TOP } from "./materials";

type Box = Extract<Solid, { kind: "box" }>;
const boxes = (solids: Solid[]) => solids.filter((s): s is Box => s.kind === "box");

describe("components", () => {
  it("LEDs glow in their own color when lit", () => {
    expect(smdLed(1, 2, "#ff2200", "L")).toMatchObject({
      kind: "box",
      id: "L",
      glow: "#ff2200",
      z: PCB_TOP,
    });
    const led = led5mm({ cx: 5, cy: 5, color: "#33ff66", id: "led" });
    const dome = led.find((s) => s.kind === "dome");
    expect(dome).toMatchObject({ id: "led", cx: 5, cy: 5, glow: "#33ff66" });
    expect(led.some((s) => s.kind === "cyl" && s.id === "led-body")).toBe(true);
  });

  it("an electrolytic capacitor is a surface can by default, or a radial one standing up", () => {
    const smdCap = capacitor({ cx: 0, cy: 0, r: 3, d: 5 });
    const radial = capacitor({ cx: 0, cy: 0, r: 3, d: 5, style: "radial" });
    expect(smdCap.some((s) => s.kind === "box")).toBe(true);
    expect(radial[0]).toMatchObject({ kind: "cyl", r: 3, d: 5 });
    expect(radial.some((s) => s.kind === "box")).toBe(false);
  });

  it("a screw terminal is as wide as its poles (5 mm apart unless told), with a screw head in each", () => {
    const solids = screwTerminal({ x: 0, y: 0, poles: 3 });
    expect((solids[0] as Box).w).toBeCloseTo(3 * 5, 6);
    expect((screwTerminal({ x: 0, y: 0, poles: 2, pitch: 3.5 })[0] as Box).w).toBeCloseTo(7, 6);
    expect(solids.filter((s) => s.kind === "disc")).toHaveLength(3);
  });

  it("a tactile button's round actuator carries the id the lab presses", () => {
    const solids = tactileButton({ x: 0, y: 0, id: "reset", actuator: "#cc2222" });
    expect(solids.find((s) => s.kind === "cyl")).toMatchObject({ id: "reset", top: "#cc2222" });
  });

  it("surface-mount resistors are black, capacitors tan, and a row alternates them", () => {
    expect(boxes(smd({ x: 0, y: 0 }))[0]).toMatchObject({ top: "#17181b", finish: "epoxy" });
    expect(boxes(smd({ x: 0, y: 0, kind: "c" }))[0]).toMatchObject({
      top: "#b9a27a",
      finish: "ceramic",
    });
    // Each part is its body and two tin end caps.
    const bodies = boxes(smdRow({ x: 0, y: 0, count: 4, step: 2 })).filter(
      (b) => b.finish !== "tin",
    );
    expect(bodies.map((b) => b.finish)).toEqual(["epoxy", "ceramic", "epoxy", "ceramic"]);
    const xs = bodies.map((b) => b.x);
    expect(xs.slice(1).map((x, i) => x - xs[i]!)).toEqual(
      [2, 2, 2].map((d) => expect.closeTo(d, 6)),
    );
  });

  it("a lying cylinder is stacked slabs, the top one carrying its id", () => {
    const slabs = boxes(
      lyingCylinder({ x: 0, cy: 5, length: 10, r: 2, color: "#d9c9a3", id: "body" }),
    );
    expect(slabs).toHaveLength(7);
    expect(slabs.filter((s) => s.id === "body")).toHaveLength(1);
    expect(slabs.at(-1)!.id).toBe("body");
    expect(
      boxes(lyingCylinder({ x: 0, cy: 5, length: 10, r: 2, color: "#fff", id: "b", layers: 3 })),
    ).toHaveLength(3);
  });

  it("a trimmer pot is a box with a screw slot", () => {
    const solids = trimPot({ x: 0, y: 0, id: "pot" });
    expect(solids[0]).toMatchObject({ kind: "box", id: "pot" });
    expect(solids.some((s) => s.kind === "path")).toBe(true);
  });
});
