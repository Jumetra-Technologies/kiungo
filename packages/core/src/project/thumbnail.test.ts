// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildStarter, circuitThumbnail } from "./";

describe("the Home thumbnail (DSK-10)", () => {
  it("draws each part where it sits and each joined pair of parts once", () => {
    const { session } = buildStarter({
      name: "Alarm",
      board: "arduino-uno",
      starter: "motion-alarm",
    });
    const thumb = circuitThumbnail(session.nodes, session.wires);
    expect(thumb.boxes.map((b) => b.kind)).toEqual(["board", "sensor", "output"]);
    expect(thumb.lines).toHaveLength(2);
    for (const b of thumb.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(thumb.width);
      expect(b.y + b.h).toBeLessThanOrEqual(thumb.height);
    }
  });

  it("an empty circuit gives an empty drawing", () => {
    expect(circuitThumbnail([], [])).toEqual({ width: 160, height: 100, boxes: [], lines: [] });
  });
});
