import { describe, expect, it } from "vitest";
import { circuit, faultKeys, part } from "../../../test/support/circuit";

const uno = part("uno", "arduino-uno");

describe("each part, checked as a whole", () => {
  it("idle until wired, ready when powered, grounded and signalled", () => {
    expect(circuit([uno, part("d", "dht11")], []).analysis.nodes.d!.status).toBe("idle");
    const ready = circuit(
      [uno, part("d", "dht11")],
      ["uno.5V>d.VCC", "uno.GND1>d.GND", "uno.D2>d.DATA"],
    ).analysis;
    expect(ready.nodes.d).toMatchObject({
      status: "ready",
      powered: true,
      grounded: true,
      supplyV: 5,
    });
    expect(ready.nodes.d!.links).toEqual([
      { board: "uno", boardPin: "D2", pin: "DATA", role: "io" },
    ]);
  });

  it("says when power or ground is missing, naming the breadboard strip that isn't fed", () => {
    const bb = part("bb", "breadboard");
    const a = circuit(
      [uno, bb, part("d", "dht11")],
      ["bb.TP1>d.VCC", "uno.GND1>d.GND", "uno.D2>d.DATA"],
    ).analysis;
    expect(a.nodes.d!.faults.find((f) => f.id === "no-power:d")?.detail).toMatch(
      /on the breadboard's .* rail, which has no supply yet/,
    );
    const b = circuit([uno, part("d", "dht11")], ["uno.5V>d.VCC", "uno.D2>d.DATA"]).analysis;
    expect(faultKeys(b, "d")).toContain("no-ground");
    expect(b.nodes.d!.status).toBe("fault");
  });

  it("a part needing one of several signals says so when none is wired", () => {
    const a = circuit(
      [uno, part("s", "soil-moisture")],
      ["uno.5V>s.VCC", "uno.GND1>s.GND"],
    ).analysis;
    expect(a.nodes.s!.faults.find((f) => f.id === "no-signal:s")?.detail).toBe(
      "Wire one of D0, A0 to a board pin.",
    );
  });

  it("an LED's current: modeled at 220 Ω with none wired, measured with a real resistor", () => {
    const bare = circuit([uno, part("l", "led")], ["uno.D13>l.A", "uno.GND1>l.C"]).analysis;
    expect(bare.nodes.l!.faults.find((f) => f.id === "resistor:l")?.severity).toBe("tip");
    expect(bare.nodes.l!.seriesOhms).toBe(0);
    const small = circuit(
      [uno, part("r", "resistor"), part("l", "led")],
      ["uno.D13>r.1", "r.2>l.A", "uno.GND1>l.C"],
      { r: { ohms: 100 } },
    ).analysis;
    expect(small.nodes.l!.seriesOhms).toBe(100);
    expect(small.nodes.l!.faults.find((f) => f.id === "too-much-current:l")).toMatchObject({
      severity: "warning",
      title: "30 mA: more than the LED takes",
    });
    const right = circuit(
      [uno, part("r", "resistor"), part("l", "led")],
      ["uno.D13>r.1", "r.2>l.A", "uno.GND1>l.C"],
      { r: { ohms: 220 } },
    ).analysis;
    expect(faultKeys(right, "l")).toEqual([]);
    expect(right.nodes.l!.status).toBe("ready");
  });

  it("partial while signals are still missing, unpowered while power is", () => {
    const partial = circuit(
      [uno, part("lcd", "lcd-16x2")],
      ["uno.5V>lcd.VCC", "uno.GND1>lcd.GND", "uno.A4>lcd.SDA"],
    ).analysis;
    expect(partial.nodes.lcd!.status).toBe("fault"); // SCL is required: an error
    const led = circuit([uno, part("l", "led")], ["uno.GND1>l.C"]).analysis;
    expect(led.nodes.l!.status).toBe("fault");
    expect(led.nodes.l!.powered).toBe(false);
  });
});
