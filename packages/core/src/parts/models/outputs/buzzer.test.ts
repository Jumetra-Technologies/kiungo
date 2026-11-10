import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { BUZZER } from "./buzzer";

describe("Buzzer, 12 mm active", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(BUZZER);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(BUZZER.id).pins.map((p) => p.id)).toEqual(["P", "N"]);
    expect(BUZZER.pins.map((p) => p.name)).toEqual(["+", "−"]);
  });
});
