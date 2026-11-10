import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { LED } from "./led";

describe("LED, 5 mm", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(LED);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(LED.id).pins.map((p) => p.id)).toEqual(["A", "C"]);
    expect(LED.pins.map((p) => p.name)).toEqual(["Anode (+)", "Cathode (−)"]);
  });
});
