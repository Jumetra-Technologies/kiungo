import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { ARDUINO_MEGA } from "./arduino-mega";

describe("Arduino Mega 2560", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(ARDUINO_MEGA);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(ARDUINO_MEGA.id).pins.map((p) => p.id)).toEqual([
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
      "A6",
      "A7",
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
      "D18",
      "D19",
      "D20",
      "D21",
      "D22",
      "D23",
      "D24",
      "D25",
      "D50",
      "D51",
      "D52",
      "D53",
      "GND3",
      "5V_ICSP",
    ]);
    expect(ARDUINO_MEGA.pins.map((p) => p.name)).toEqual([
      "D0–D53",
      "A0–A15",
      "TX0–TX3 / RX0–RX3",
      "SDA / SCL (20 / 21)",
      "50–53",
      "5V / 3.3V",
      "GND",
      "VIN",
    ]);
  });
});
