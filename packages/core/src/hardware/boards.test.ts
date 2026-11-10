// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HARDWARE_BOARDS, hardwareBoard, uploadTargetsFor } from "./boards";
import { NANO, UNO, maxSketchBytes } from "../boards";
import { PROJECT_BOARDS } from "../project";

describe("board definitions (HWT-01)", () => {
  it("limits are the board packages' own", () => {
    const limits = Object.fromEntries(
      HARDWARE_BOARDS.map((b) => [b.id, [b.flashBytes, b.ramBytes]]),
    );
    expect(limits).toEqual({
      uno: [32_256, 2048],
      nano: [30_720, 2048],
      "nano-old": [30_720, 2048],
      mega: [253_952, 8192],
      esp32: [1_310_720, 327_680],
    });
  });

  it("agrees with the emulator's boards", () => {
    expect(maxSketchBytes(UNO)).toBe(hardwareBoard("uno")!.flashBytes);
    expect(maxSketchBytes(NANO)).toBe(hardwareBoard("nano")!.flashBytes);
  });

  it("each pin is listed once, with what it can do", () => {
    for (const board of HARDWARE_BOARDS) {
      const numbers = board.pins.map((p) => p.arduino);
      expect(new Set(numbers).size, board.id).toBe(numbers.length);
      expect(
        board.pins.every((p) => p.functions.length > 0),
        board.id,
      ).toBe(true);
    }
    expect(
      hardwareBoard("uno")!
        .pins.filter((p) => p.functions.includes("pwm"))
        .map((p) => p.arduino),
    ).toEqual([3, 5, 6, 9, 10, 11]);
    expect(hardwareBoard("mega")!.pins).toHaveLength(70);
    expect(
      hardwareBoard("esp32")!
        .pins.filter((p) => p.inputOnly)
        .map((p) => p.arduino),
    ).toEqual([34, 35, 36, 39]);
    expect(hardwareBoard("nano")!.pins.find((p) => p.name === "A6")?.inputOnly).toBe(true);
  });

  it("a project uploads to boards with the same chip", () => {
    expect(uploadTargetsFor("arduino-uno").map((b) => b.id)).toEqual(["uno", "nano", "nano-old"]);
    expect(uploadTargetsFor("arduino-mega").map((b) => b.id)).toEqual(["mega"]);
    expect(uploadTargetsFor("esp32").map((b) => b.id)).toEqual(["esp32"]);
    expect(uploadTargetsFor("led")).toEqual([]);
  });

  it("every project board has an upload target with the same FQBN and board package", () => {
    for (const p of PROJECT_BOARDS) {
      const own = uploadTargetsFor(p.part)[0];
      expect(own!.fqbn, p.part).toBe(p.fqbn);
      expect(own!.platform, p.part).toEqual(p.platform);
    }
  });
});
