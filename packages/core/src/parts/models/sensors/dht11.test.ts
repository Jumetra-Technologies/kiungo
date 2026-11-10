import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { DHT11 } from "./dht11";

describe("DHT11 humidity & temperature", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(DHT11);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(DHT11.id).pins.map((p) => p.id)).toEqual(["VCC", "DATA", "NC", "GND"]);
    expect(DHT11.pins.map((p) => p.name)).toEqual(["VCC", "DATA", "NC", "GND"]);
  });
});
