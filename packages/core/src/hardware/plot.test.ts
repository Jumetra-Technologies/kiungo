// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LineSplitter, parsePlotLine } from "./plot";

describe("the serial plotter (HW-02)", () => {
  it("reads lines as the Arduino IDE's plotter does", () => {
    expect(parsePlotLine("12")).toEqual({ values: [{ name: "1", value: 12 }] });
    expect(parsePlotLine("1.5 -2,3e2\t4")?.values.map((v) => v.value)).toEqual([1.5, -2, 300, 4]);
    expect(parsePlotLine("temp:21.5 humidity:40")).toEqual({
      values: [
        { name: "temp", value: 21.5 },
        { name: "humidity", value: 40 },
      ],
    });
    expect(parsePlotLine("Distance: 12")).toEqual({ values: [{ name: "Distance", value: 12 }] });
    expect(parsePlotLine("Distance: 20 cm")).toEqual({ values: [{ name: "Distance", value: 20 }] });
    expect(parsePlotLine("23.4 C, humidity: 40")?.values.map((v) => v.value)).toEqual([23.4]);
    expect(parsePlotLine("Nothing in range")).toBeNull();
    expect(parsePlotLine("")).toBeNull();
  });

  it("joins text split across chunks into whole lines", () => {
    const s = new LineSplitter();
    expect(s.push("Hel")).toEqual([]);
    expect(s.push("lo\r\nWor")).toEqual(["Hello"]);
    expect(s.push("ld\n1\n")).toEqual(["World", "1"]);
  });

  it("a board that never sends a newline doesn't grow the buffer forever", () => {
    const s = new LineSplitter();
    expect(s.push("x".repeat(5000))).toHaveLength(1);
  });
});
