import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { LORA } from "./lora";

describe("LoRa Ra-02 (SX1278)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(LORA);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(LORA.id).pins.map((p) => p.id)).toEqual([
      "VCC",
      "GND",
      "NSS",
      "MOSI",
      "MISO",
      "SCK",
      "RST",
      "DIO0",
      "DIO1",
    ]);
    expect(LORA.pins.map((p) => p.name)).toEqual([
      "3.3V",
      "GND",
      "NSS",
      "MOSI",
      "MISO",
      "SCK",
      "RST",
      "DIO0",
      "DIO1–DIO5",
    ]);
  });
});
