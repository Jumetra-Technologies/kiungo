import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { DHT22 } from "./dht22";

describe("DHT22 humidity & temperature", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(DHT22);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(DHT22.id).pins.map((p) => p.id)).toEqual(["VCC", "DATA", "NC", "GND"]);
    expect(DHT22.pins.map((p) => p.name)).toEqual(["VCC", "DATA", "NC", "GND"]);
  });
});
