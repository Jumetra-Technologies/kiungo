import { describe, expect, it } from "vitest";
import { expectWellMadePart } from "../../../../test/support/part-model";
import { getPinout } from "../../../lab/pinout";
import { MPU6050 } from "./mpu6050";

describe("MPU-6050 motion sensor (GY-521)", () => {
  it("is complete, consistent and wireable in the lab", () => {
    expectWellMadePart(MPU6050);
  });

  it("has the pins the lab wires, and names them as the part is printed", () => {
    expect(getPinout(MPU6050.id).pins.map((p) => p.id)).toEqual([
      "VCC",
      "GND",
      "SCL",
      "SDA",
      "XDA",
      "XCL",
      "AD0",
      "INT",
    ]);
    expect(MPU6050.pins.map((p) => p.name)).toEqual([
      "VCC",
      "GND",
      "SCL",
      "SDA",
      "XDA",
      "XCL",
      "AD0",
      "INT",
    ]);
  });
});
