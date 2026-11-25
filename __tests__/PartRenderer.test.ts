// @vitest-environment node
/**
 * The WebGL part renderer's logic that needs no GPU: its camera reproduces the
 * lab's pin projection exactly, materials are chosen sensibly, and the part
 * builders put things where real boards have them.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PARTS, getPart } from "@kiungo/core/parts";
import { project, stageLift } from "@kiungo/core/parts/geometry";
import { MATERIAL, PCB_TOP, SOLDER_STUB, barrelJack, maleHeader, microUsb, usbB } from "@kiungo/core/parts/build";
import type { Solid } from "@kiungo/core/parts/types";
import { viewMatrix } from "@kiungo/lab/render3d/renderer";
import { finishOf, metalOf } from "@kiungo/lab/render3d/materials";

describe("the camera", () => {
  it("lands every point where the lab's project() says, for every board and view", () => {
    const views = [
      { spin: -24, tilt: 50 },
      { spin: 0, tilt: 0 },
      { spin: 30, tilt: 70 },
      { spin: -90, tilt: 90 },
    ];
    for (const model of PARTS) {
      for (const view of views) {
        const m = viewMatrix(model, view);
        for (const p of [
          { x: 0, y: 0, z: 0 },
          { x: model.size.w, y: model.size.h, z: model.size.d },
          { x: model.size.w * 0.3, y: model.size.h * 0.8, z: 1.6 },
        ]) {
          // World y is the model's y flipped; the camera's screen y points up.
          const v = new THREE.Vector3(p.x, -p.y, p.z).applyMatrix4(m);
          const want = project(model, 1, view, p);
          expect(v.x).toBeCloseTo(want.x, 6);
          expect(-v.y).toBeCloseTo(want.y, 6);
        }
      }
    }
  });

  it("keeps the part in front of the camera", () => {
    const uno = getPart("arduino-uno")!;
    const v = new THREE.Vector3(0, 0, uno.size.d).applyMatrix4(viewMatrix(uno, { spin: -24, tilt: 50 }));
    expect(v.z).toBeLessThan(-1);
    expect(stageLift(uno, 1)).toBeGreaterThan(0);
  });
});

describe("materials", () => {
  const box = (extra: Partial<Extract<Solid, { kind: "box" }>>) => ({ kind: "box", x: 0, y: 0, w: 1, h: 1, d: 1, top: "#000000", ...extra }) as Extract<Solid, { kind: "box" }>;
  it("uses a solid's own finish, else infers one", () => {
    expect(finishOf(box({ finish: "rubber" }))).toBe("rubber");
    expect(finishOf(box({ id: "pcb", top: "#00878f" }))).toBe("soldermask");
    expect(finishOf(box({ top: MATERIAL.steel }))).toBe("metal");
    expect(finishOf(box({ top: MATERIAL.gold }))).toBe("gold");
    expect(finishOf(box({ top: "#2f6fd6" }))).toBe("plastic");
    expect(finishOf({ kind: "dome", cx: 0, cy: 0, r: 1, d: 1, color: "#ff0000", clear: true })).toBe("clear");
  });

  it("tells plated pads from print", () => {
    expect(metalOf(MATERIAL.gold)).toBe("gold");
    expect(metalOf(MATERIAL.tin)).toBe("tin");
    expect(metalOf(MATERIAL.silk)).toBeNull();
    expect(metalOf("#0b0c0e")).toBeNull();
  });
});

describe("builders", () => {
  it("a breadboard-style header hangs under the board, with solder joints on top", () => {
    const solids = maleHeader(0, 0, 3, "x");
    const plastic = solids[0] as Extract<Solid, { kind: "box" }>;
    expect((plastic.z ?? 0) + plastic.d).toBeCloseTo(0); // under the board's base
    const pins = solids[1] as Extract<Solid, { kind: "pins" }>;
    expect((pins.z ?? 0) + pins.len).toBeCloseTo(PCB_TOP + SOLDER_STUB);
    expect(solids.filter((s) => s.kind === "dome")).toHaveLength(3);
  });

  it("a standing header keeps its plastic on the board and its pins up", () => {
    const [plastic, pins] = maleHeader(0, 0, 3, "x", 1, false) as [Extract<Solid, { kind: "box" }>, Extract<Solid, { kind: "pins" }>];
    expect(plastic.z).toBe(PCB_TOP);
    expect(pins.len).toBeGreaterThan(0);
  });

  it("sockets open on the edge they face", () => {
    const [shell, mouth, insert] = usbB(-6, 5, PCB_TOP, "left") as Array<Extract<Solid, { kind: "box" }>>;
    expect(mouth.x).toBeLessThan(shell.x + 1);
    expect(insert.top).toBe("#eceae4"); // USB-B's white tongue
    const [s2, slot] = microUsb(20, -1, PCB_TOP, "top") as Array<Extract<Solid, { kind: "box" }>>;
    expect([s2.w, s2.h]).toEqual([7.5, 5.6]); // 7.5 wide along the top edge, 5.6 deep into the board
    expect(slot.y).toBeLessThan(s2.y + 1);
    const jack = barrelJack(0, 0, PCB_TOP, "left");
    expect(jack.filter((s) => s.kind === "cyl").every((s) => (s as { axis?: string }).axis === "x")).toBe(true);
  });
});
