import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { WIFI_MODULE } from "./wifi-module";

describe("ESP-01 Wi-Fi module", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(WIFI_MODULE);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(WIFI_MODULE.id).pins.map((p) => p.id)).toEqual([
      "VCC",
      "GND",
      "TX",
      "RX",
      "EN",
      "RST",
      "GPIO0",
      "GPIO2",
    ]);
    expect(WIFI_MODULE.pins.map((p) => p.name)).toEqual([
      "VCC",
      "GND",
      "TX",
      "RX",
      "CH_PD (EN)",
      "RST",
      "GPIO0",
      "GPIO2",
    ]);
  });
});
