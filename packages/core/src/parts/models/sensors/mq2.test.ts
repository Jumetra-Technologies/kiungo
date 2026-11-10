import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { MQ2 } from "./mq2";

describe("MQ-2 gas & smoke sensor", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(MQ2);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(MQ2.id).pins.map((p) => p.id)).toEqual(["VCC", "GND", "D0", "A0"]);
    expect(MQ2.pins.map((p) => p.name)).toEqual(["VCC", "GND", "D0", "A0"]);
  });
});
