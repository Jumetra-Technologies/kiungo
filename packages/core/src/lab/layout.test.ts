import { describe, expect, it } from "vitest";
import { boardGeometry } from "./board-geometry";
import { analyze } from "./circuit";
import { nodeFootprint, nodeLayout } from "./layout";
import { frameAt, serialLine } from "./simulate";
import type { LabNode, LabWire } from "./types";
import { getPart } from "../parts";

const node = (id: string, partId: string, x = 0, y = 0): LabNode => ({
  id,
  partId,
  label: getPart(partId)?.name.split(" (")[0] ?? partId,
  x,
  y,
  mode: "virtual",
});

let seq = 0;

const wire = (a: string, ap: string, b: string, bp: string): LabWire => ({
  id: `w${++seq}`,
  from: { node: a, pin: ap },
  to: { node: b, pin: bp },
});

const uno = node("uno", "arduino-uno", 0, 0);

const bb = node("bb", "breadboard", 420, 0);

/** The Uno's 5 V and GND on the top rails, as the lab wires a new breadboard. */
const fed = () => [wire("uno", "5V", "bb", "TP1"), wire("uno", "GND1", "bb", "TN1")];

describe("On the canvas", () => {
  it("is drawn as itself in every view, Trace included, and never as a 400-row card", () => {
    const three = boardGeometry("breadboard", "reality")!;
    const two = boardGeometry("breadboard", "top")!;
    const trace = boardGeometry("breadboard", "flow")!;
    expect(trace).toBeTruthy();
    expect([two.w, two.h]).toEqual([three.w, three.h]);
    expect(three.view).toEqual({ spin: 0, tilt: 35 });
    expect(Object.keys(three.pins)).toHaveLength(400);
    // Holes far enough apart to aim at.
    expect(three.pins.a2!.x - three.pins.a1!.x).toBeGreaterThan(10);
    expect(three.pins.b1!.y - three.pins.a1!.y).toBeGreaterThan(8);
    expect(nodeLayout("breadboard").bare).toBeTruthy();
    expect(nodeFootprint("breadboard").h).toBeLessThan(400);
  });

  it("keeps the breadboard out of the serial monitor", () => {
    const parts = [uno, bb];
    const a = analyze(parts, fed());
    const frame = frameAt({ nodes: parts, wires: fed(), analysis: a, t: 2, running: true });
    expect(frame.nodes.bb!.badge).toBe("5 V · GND");
    expect(serialLine(parts, frame) ?? "").not.toMatch(/Breadboard/);
  });
});
