import { describe, expect, it } from "vitest";
import { circuit, faultKeys, part } from "../../../test/support/circuit";

const uno = part("uno", "arduino-uno");
const esp = part("esp", "esp32");

describe("boards", () => {
  it("are powered over USB unless one of their rails is shorted", () => {
    const fine = circuit([uno], []).analysis;
    expect(fine.nodes.uno).toMatchObject({ status: "ready", powered: true, supplyV: 5 });
    const shorted = circuit([uno], ["uno.5V>uno.GND1"]).analysis;
    expect(shorted.nodes.uno).toMatchObject({ status: "fault", powered: false });
  });

  it("linked to each other: by bus, with TX crossed and levels checked", () => {
    const i2c = circuit([uno, esp], ["uno.A4>esp.D21", "uno.GND1>esp.GND1"]).analysis;
    expect(i2c.boardLinks).toEqual([{ a: "uno", b: "esp", aPin: "A4", bPin: "D21", bus: "i2c" }]);
    expect(i2c.faults.find((f) => f.id === "level:uno:A4:esp:D21")?.severity).toBe("error");
    const uart = circuit([uno, esp], ["uno.D1>esp.TX", "uno.GND1>esp.GND1"]).analysis;
    expect(uart.faults.find((f) => f.id.startsWith("uart-cross:"))?.title).toBe("TX wired to TX");
    const power = circuit([uno, esp], ["uno.5V>esp.VIN"]).analysis;
    expect(power.boardLinks.map((l) => l.bus)).toContain("power");
    expect(power.faults.filter((f) => f.id.startsWith("common-ground"))).toEqual([]);
  });

  it("boards that share a signal need a common ground", () => {
    const apart = circuit([uno, esp], ["uno.D2>esp.D21"]).analysis;
    expect(apart.faults.find((f) => f.id === "common-ground:esp|uno")?.severity).toBe("warning");
    const joined = circuit([uno, esp], ["uno.D2>esp.D21", "uno.GND1>esp.GND1"]).analysis;
    expect(joined.faults.find((f) => f.id.startsWith("common-ground"))).toBeUndefined();
  });
});

describe("breadboards", () => {
  const bb = part("bb", "breadboard");

  it("are idle until wired, and say what their rails carry", () => {
    expect(circuit([uno, bb], []).analysis.nodes.bb).toMatchObject({
      status: "idle",
      powered: false,
    });
    const fed = circuit([uno, bb], ["uno.5V>bb.TP1", "uno.GND1>bb.TN1"]).analysis;
    expect(fed.nodes.bb).toMatchObject({ status: "ready", supplyV: 5, grounded: true });
  });

  it("flag rails wired against their stripes", () => {
    const a = circuit([uno, bb], ["uno.GND1>bb.TP1", "uno.5V>bb.TN1"]).analysis;
    expect(faultKeys(a, "bb")).toEqual(
      expect.arrayContaining(["rail-sign:bb:TP", "rail-sign:bb:TN"]),
    );
    expect(a.nodes.bb!.faults.map((f) => f.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^GND on the/),
        expect.stringMatching(/^5 V on the/),
      ]),
    );
  });
});
