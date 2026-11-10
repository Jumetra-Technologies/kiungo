import { describe, expect, it } from "vitest";
import { ESP32, ESP8266, MEGA, MICROBIT, PI4, PICO, STM32, TEENSY, UNO } from "./boards";

const BOARDS = [UNO, MEGA, ESP32, PICO, ESP8266, STM32, PI4, MICROBIT, TEENSY];
const pin = (board: typeof UNO, id: string) => board.pins.find((p) => p.id === id);

describe("board pinouts", () => {
  it.each(BOARDS.map((b) => [b.partId, b] as const))(
    "%s has unique pins, a supply, a ground, and a logic level",
    (_id, board) => {
      const ids = board.pins.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(board.controller).toBe(true);
      expect(board.pins.some((p) => p.supplies)).toBe(true);
      expect(board.pins.some((p) => p.fns?.includes("ground"))).toBe(true);
      expect([3.3, 5]).toContain(board.logic);
      for (const p of board.pins) expect(["left", "right"]).toContain(p.side);
    },
  );

  it("the Uno: 5 V logic, an LED on 13, I²C on A4/A5, PWM on the ~ pins", () => {
    expect(UNO.logic).toBe(5);
    expect(pin(UNO, "D13")?.fns).toContain("led");
    expect(pin(UNO, "A4")?.fns).toContain("sda");
    expect(pin(UNO, "A5")?.fns).toContain("scl");
    for (const id of ["D3", "D5", "D6", "D9", "D10", "D11"])
      expect(pin(UNO, id)?.fns, id).toContain("pwm");
    expect(pin(UNO, "D2")?.fns).not.toContain("pwm");
  });

  it("3.3 V boards: the ESP32's input-only pins, the Pi's lack of analog inputs", () => {
    expect(ESP32.logic).toBe(3.3);
    for (const id of ["D34", "D35", "D36", "D39"]) expect(pin(ESP32, id)?.inputOnly, id).toBe(true);
    expect(PI4.pins.some((p) => p.fns?.includes("analog"))).toBe(false);
    expect(PICO.logic).toBe(3.3);
  });
});
