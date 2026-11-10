// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNO } from "../boards";
import { AvrBoard } from "./";
import { Peripherals } from "./peripherals";

const hex = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures", "sketches", `${name}-uno.hex`), "utf8");

function run(name: string) {
  const board = new AvrBoard(UNO, hex(name));
  let serial = "";
  board.onSerialByte((b) => (serial += String.fromCharCode(b)));
  const peripherals = new Peripherals(board);
  return { board, peripherals, serial: () => serial };
}

describe("running out of RAM (HWT-07)", () => {
  it("the stack runs over the chip's registers and the board stops, as a real one does", () => {
    const { board, serial } = run("stack");
    board.runMs(200);
    // It got as far as starting to print, then the stack ate the RAM: that's all a real Uno prints too.
    expect(serial().length).toBeGreaterThan(0);
    expect("start\r\n".startsWith(serial())).toBe(true);
    expect(board.crashed).not.toBeNull();
    // Nothing runs after a crash.
    const at = board.cycles;
    board.runMs(100);
    expect(board.cycles).toBe(at);
  }, 60_000);

  it("a program that fits keeps running", () => {
    const { board, peripherals } = run("distance");
    peripherals.apply([{ kind: "hc-sr04", id: "s1", trig: 2, echo: 3, distanceCm: 42 }]);
    board.runMs(500);
    expect(board.crashed).toBeNull();
  }, 30_000);
});
