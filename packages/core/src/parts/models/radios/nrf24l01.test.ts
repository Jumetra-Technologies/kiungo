import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { NRF24L01 } from "./nrf24l01";

describe("nRF24L01+ radio", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(NRF24L01);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(NRF24L01.id).pins.map((p) => p.id)).toEqual([
      "GND",
      "VCC",
      "CE",
      "CSN",
      "SCK",
      "MOSI",
      "MISO",
      "IRQ",
    ]);
    expect(NRF24L01.pins.map((p) => p.name)).toEqual([
      "GND",
      "VCC",
      "CE",
      "CSN",
      "SCK",
      "MOSI",
      "MISO",
      "IRQ",
    ]);
  });
});
