import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { RELAY } from "./relay";

describe("Relay module, 5 V", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(RELAY);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(RELAY.id).pins.map((p) => p.id)).toEqual([
      "VCC",
      "GND",
      "IN",
      "COM",
      "NO",
      "NC",
    ]);
    expect(RELAY.pins.map((p) => p.name)).toEqual(["VCC", "GND", "IN", "COM", "NO", "NC"]);
  });
});
