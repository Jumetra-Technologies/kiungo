import { describe, expect, it } from "vitest";
import { BoardDefinitionSchema } from "./board";

const validBoard = () => ({
  id: "test",
  name: "Test board",
  fqbn: "vendor:arch:test",
  mcu: "MCU1",
  clockHz: 16_000_000,
  flashBytes: 32768,
  sramBytes: 2048,
  eepromBytes: 0,
  adcBits: 10,
  adcRefVolts: 5,
  logicVolts: 5,
  maxPinMilliamps: 20,
  emulator: "avr8js",
  pins: [
    { id: "D2", functions: ["digital", "interrupt"] },
    { id: "A0", functions: ["adc"], reserved: true },
  ],
});

describe("BoardDefinitionSchema", () => {
  it("accepts a valid board and defaults reserved to false", () => {
    const parsed = BoardDefinitionSchema.parse(validBoard());
    expect(parsed.pins[0]?.reserved).toBe(false);
    expect(parsed.pins[1]?.reserved).toBe(true);
  });

  it.each(["clockHz", "flashBytes", "sramBytes", "adcBits"])("rejects a zero %s", (field) => {
    expect(BoardDefinitionSchema.safeParse({ ...validBoard(), [field]: 0 }).success).toBe(false);
  });

  it("rejects fractional memory sizes", () => {
    expect(BoardDefinitionSchema.safeParse({ ...validBoard(), flashBytes: 10.5 }).success).toBe(
      false,
    );
  });

  it("allows zero EEPROM but not a negative size", () => {
    expect(BoardDefinitionSchema.safeParse({ ...validBoard(), eepromBytes: 0 }).success).toBe(true);
    expect(BoardDefinitionSchema.safeParse({ ...validBoard(), eepromBytes: -1 }).success).toBe(
      false,
    );
  });

  it("rejects an unknown pin function", () => {
    const board = validBoard();
    board.pins[0] = { id: "D2", functions: ["laser"] };
    expect(BoardDefinitionSchema.safeParse(board).success).toBe(false);
  });

  it("rejects an unknown emulator", () => {
    expect(BoardDefinitionSchema.safeParse({ ...validBoard(), emulator: "magic" }).success).toBe(
      false,
    );
  });

  it("rejects duplicate pin ids with a helpful message", () => {
    const board = validBoard();
    board.pins.push({ id: "D2", functions: ["digital"] });
    const result = BoardDefinitionSchema.safeParse(board);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("duplicate pin id D2");
  });

  it("rejects empty identifiers", () => {
    expect(BoardDefinitionSchema.safeParse({ ...validBoard(), id: "" }).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { fqbn: _omitted, ...rest } = validBoard();
    expect(BoardDefinitionSchema.safeParse(rest).success).toBe(false);
  });
});
