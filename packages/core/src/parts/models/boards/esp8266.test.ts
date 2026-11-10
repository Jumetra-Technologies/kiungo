import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { ESP8266 } from "./esp8266";

describe("ESP8266 NodeMCU", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(ESP8266);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(ESP8266.id).pins.map((p) => p.id)).toEqual([
      "VIN",
      "3V3",
      "GND1",
      "A0",
      "RX",
      "TX",
      "GND2",
      "D0",
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
    ]);
    expect(ESP8266.pins.map((p) => p.name)).toEqual([
      "D0–D8",
      "A0",
      "D1 / D2",
      "D5 / D6 / D7 / D8",
      "TX / RX",
      "VIN",
      "3V3",
      "GND",
    ]);
  });
});
