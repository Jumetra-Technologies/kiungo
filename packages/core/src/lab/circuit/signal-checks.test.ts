import { describe, expect, it } from "vitest";
import { circuit, faultKeys, part } from "../../../test/support/circuit";

const uno = part("uno", "arduino-uno");
const esp = part("esp", "esp32");
const pi = part("pi", "raspberry-pi-4");

describe("signal pins", () => {
  it("an analog output on a digital-only pin, and on a board with no analog inputs", () => {
    const a = circuit([uno, part("ldr", "ldr")], ["uno.5V>ldr.L1", "uno.D2>ldr.L2"]).analysis;
    expect(a.nodes.ldr!.faults.find((f) => f.id === "not-analog:L2:ldr")?.title).toBe(
      "D2 can't read analog",
    );
    const b = circuit([pi, part("ldr", "ldr")], ["pi.3V3>ldr.L1", "pi.GPIO4>ldr.L2"]).analysis;
    expect(b.nodes.ldr!.faults.find((f) => f.id === "not-analog:L2:ldr")?.title).toBe(
      "pi has no analog inputs",
    );
  });

  it("I²C lines swapped, or off the hardware pins", () => {
    const swapped = circuit(
      [uno, part("lcd", "lcd-16x2")],
      ["uno.5V>lcd.VCC", "uno.GND1>lcd.GND", "uno.A5>lcd.SDA", "uno.A4>lcd.SCL"],
    ).analysis;
    expect(faultKeys(swapped, "lcd")).toEqual(
      expect.arrayContaining(["swapped:SDA", "swapped:SCL"]),
    );
    const off = circuit(
      [uno, part("lcd", "lcd-16x2")],
      ["uno.5V>lcd.VCC", "uno.GND1>lcd.GND", "uno.D2>lcd.SDA", "uno.A5>lcd.SCL"],
    ).analysis;
    expect(off.nodes.lcd!.faults.find((f) => f.id === "bus-pin:SDA:lcd")?.severity).toBe("warning");
  });

  it("serial: TX to TX is an error, TX on a plain pin is a tip, 5 V into a 3.3 V RX is a warning", () => {
    const base = ["uno.5V>bt.VCC", "uno.GND1>bt.GND"];
    const txTx = circuit(
      [uno, part("bt", "hc-05")],
      [...base, "uno.D1>bt.TXD", "uno.D0>bt.RXD"],
    ).analysis;
    expect(txTx.nodes.bt!.faults.find((f) => f.id === "uart:TXD:bt")).toMatchObject({
      severity: "error",
      title: "TX wired to TX",
    });
    const plain = circuit(
      [uno, part("bt", "hc-05")],
      [...base, "uno.D2>bt.TXD", "uno.D3>bt.RXD"],
    ).analysis;
    expect(plain.nodes.bt!.faults.find((f) => f.id === "uart:TXD:bt")?.severity).toBe("tip");
    const right = circuit(
      [uno, part("bt", "hc-05")],
      [...base, "uno.D0>bt.TXD", "uno.D1>bt.RXD"],
    ).analysis;
    expect(faultKeys(right, "bt")).toContain("level-rx:RXD");
    expect(faultKeys(right, "bt")).not.toContain("uart:TXD");
  });

  it("a 5 V part's output into a 3.3 V board, unless the part runs at 3.3 V", () => {
    const five = circuit(
      [esp, part("d", "dht11")],
      ["esp.VIN>d.VCC", "esp.GND1>d.GND", "esp.D21>d.DATA"],
    ).analysis;
    expect(five.nodes.d!.faults.find((f) => f.id === "level-out:DATA:d")?.severity).toBe("error");
    const three = circuit(
      [esp, part("d", "dht11")],
      ["esp.3V3>d.VCC", "esp.GND1>d.GND", "esp.D21>d.DATA"],
    ).analysis;
    expect(faultKeys(three, "d")).not.toContain("level-out:DATA");
  });

  it("two-way data on an input-only pin; a signal on a supply; a required signal unwired", () => {
    const inOnly = circuit(
      [esp, part("d", "dht11")],
      ["esp.3V3>d.VCC", "esp.GND1>d.GND", "esp.D34>d.DATA"],
    ).analysis;
    expect(faultKeys(inOnly, "d")).toContain("input-only:DATA");
    const rail = circuit(
      [uno, part("d", "dht11")],
      ["uno.5V>d.VCC", "uno.GND1>d.GND", "uno.3V3>d.DATA"],
    ).analysis;
    expect(faultKeys(rail, "d")).toContain("rail-signal:DATA");
    const unwired = circuit(
      [uno, part("lcd", "lcd-16x2")],
      ["uno.5V>lcd.VCC", "uno.GND1>lcd.GND", "uno.A5>lcd.SCL"],
    ).analysis;
    expect(unwired.nodes.lcd!.faults.find((f) => f.id === "unwired:SDA:lcd")?.detail).toMatch(
      /a GPIO pin/,
    );
  });
});
