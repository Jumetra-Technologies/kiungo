import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { STM32 } from "./stm32";

describe("STM32 Blue Pill", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(STM32);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(STM32.id).pins.map((p) => p.id)).toEqual([
      "5V",
      "3V3",
      "GND1",
      "PA0",
      "PA1",
      "PA2",
      "PA3",
      "PA4",
      "PA5",
      "PA6",
      "PA7",
      "PB0",
      "PB1",
      "PB10",
      "PB11",
      "GND2",
      "PC13",
      "PB6",
      "PB7",
      "PB8",
      "PB9",
      "PA8",
      "PA9",
      "PA10",
      "PA15",
      "PB12",
      "PB13",
      "PB14",
      "PB15",
    ]);
    expect(STM32.pins.map((p) => p.name)).toEqual([
      "PA0–PA15, PB0–PB15",
      "PA0–PA7, PB0–PB1",
      "PC13",
      "PA9 / PA10",
      "PB6 / PB7",
      "PA5 / PA6 / PA7",
      "5V",
      "3.3",
      "G",
      "VB",
    ]);
  });
});
