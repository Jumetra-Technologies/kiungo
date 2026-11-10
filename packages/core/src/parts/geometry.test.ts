import { describe, expect, it } from "vitest";
import { getPart } from "./index";
import { SIN_TILT, TILT, dropBelow, project, projectAngle, stageLift } from "./geometry";

const uno = getPart("arduino-uno")!;
const esp32 = getPart("esp32")!;

describe("the 3D view's geometry", () => {
  it("measures how far a part hangs below its base: an ESP32's header pins, nothing on an Uno", () => {
    expect(dropBelow(uno)).toBe(0);
    expect(dropBelow(esp32)).toBe(2.5);
  });

  it("lifts the stage by half the part's height above its base, at the library's tilt", () => {
    expect(SIN_TILT).toBeCloseTo(Math.sin((TILT * Math.PI) / 180), 10);
    expect(stageLift(uno, 2)).toBeCloseTo((uno.size.d / 2) * SIN_TILT * 2, 6);
    expect(stageLift(esp32, 1)).toBeCloseTo(((esp32.size.d - dropBelow(esp32)) / 2) * SIN_TILT, 6);
  });

  it("projects the board's center to the stage center, raised by the lift", () => {
    const view = { spin: 30, tilt: 50 };
    const center = { x: uno.size.w / 2, y: uno.size.h / 2, z: 0 };
    expect(project(uno, 3, view, center).x).toBeCloseTo(0, 6);
    expect(project(uno, 3, view, center).y).toBeCloseTo(stageLift(uno, 3), 6);
  });

  it("seen from straight above, it is the plan view at scale", () => {
    const top = { spin: 0, tilt: 0 };
    const p = project(uno, 2, top, { x: 10, y: 5, z: 7 });
    expect(p.x).toBeCloseTo((10 - uno.size.w / 2) * 2, 6);
    expect(p.y).toBeCloseTo((5 - uno.size.h / 2) * 2 + stageLift(uno, 2), 6);
  });

  it("turns directions with the spin: +x points right, then down after a quarter turn", () => {
    expect(projectAngle(uno, 1, { spin: 0, tilt: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 6);
    expect(projectAngle(uno, 1, { spin: 90, tilt: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 6);
    // Up out of the board leans away from the viewer when tilted.
    expect(projectAngle(uno, 1, { spin: 0, tilt: 60 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(-90, 6);
  });
});
