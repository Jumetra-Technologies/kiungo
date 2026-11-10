import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { HC_SR04 } from "./hc-sr04";

describe("HC-SR04 ultrasonic distance", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(HC_SR04);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(HC_SR04.id).pins.map((p) => p.id)).toEqual(["VCC", "TRIG", "ECHO", "GND"]);
    expect(HC_SR04.pins.map((p) => p.name)).toEqual(["VCC", "Trig", "Echo", "GND"]);
  });
});
