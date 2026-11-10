import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { ARDUINO_UNO } from "./model";

describe("Arduino Uno", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(ARDUINO_UNO);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(ARDUINO_UNO.id).pins.map((p) => p.id)).toEqual([
      "VIN",
      "5V",
      "3V3",
      "GND1",
      "GND2",
      "A0",
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "D0",
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
      "D9",
      "D10",
      "D11",
      "D12",
      "D13",
      "GND3",
      "5V_ICSP",
    ]);
    expect(ARDUINO_UNO.pins.map((p) => p.name)).toEqual([
      "D0 (RX)",
      "D1 (TX)",
      "D2",
      "D~3",
      "D4",
      "D~5",
      "D~6",
      "D7",
      "D8",
      "D~9",
      "D~10",
      "D~11",
      "D12",
      "D13",
      "A0–A5",
      "5V",
      "3.3V",
      "GND",
      "VIN",
      "RESET",
      "AREF",
    ]);
  });

  it("is the real R3, its ATmega328P socketed bottom right", () => {
    expect(ARDUINO_UNO.size).toMatchObject({ w: 68.6, h: 53.4 });
    const mcu = ARDUINO_UNO.features.find((f) => f.id === "mcu")!;
    expect(mcu.x).toBeGreaterThan(29);
    expect(mcu.y).toBeGreaterThan(33);
    expect(mcu.w).toBeCloseTo(35.6, 1);
  });
});
