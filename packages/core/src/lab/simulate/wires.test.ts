import { describe, expect, it } from "vitest";
import { circuit, part } from "../../../test/support/circuit";
import { frameAt } from "./frame-at";
import { serialLine, wireFlows } from "./wires";

const uno = part("uno", "arduino-uno");

describe("what each wire carries", () => {
  it("power and ground carry current only when something they feed is powered", () => {
    const { nodes, wires, analysis } = circuit(
      [uno, part("d", "dht11")],
      ["uno.5V>d.VCC", "uno.GND1>d.GND", "uno.D2>d.DATA"],
    );
    const flows = wireFlows(nodes, wires, analysis, {}, true);
    expect(flows[wires[0]!.id]).toEqual({ flow: "power", level: 1 });
    expect(flows[wires[1]!.id]).toEqual({ flow: "ground", level: 1 });
    // DATA is two-way: drawn as data, at the level its pins have now.
    expect(flows[wires[2]!.id]).toEqual({ flow: "data", level: 0 });
    expect(wireFlows(nodes, wires, analysis, { "uno:D2": 0.7 }, true)[wires[2]!.id]).toEqual({
      flow: "data",
      level: 0.7,
    });
    expect(wireFlows(nodes, wires, analysis, { "uno:D2": 0.7 }, false)[wires[2]!.id]).toEqual({
      flow: "data",
      level: 0,
    });
  });

  it("a plain output is a signal; a short or a wire with an error is a fault", () => {
    const led = circuit([uno, part("l", "led")], ["uno.D13>l.A", "uno.GND1>l.C"]);
    expect(
      wireFlows(led.nodes, led.wires, led.analysis, { "uno:D13": 1 }, true)[led.wires[0]!.id],
    ).toEqual({ flow: "signal", level: 1 });
    const short = circuit([uno], ["uno.5V>uno.GND1"]);
    expect(
      wireFlows(short.nodes, short.wires, short.analysis, {}, true)[short.wires[0]!.id],
    ).toEqual({ flow: "fault", level: 1 });
    expect(
      wireFlows(
        short.nodes,
        [{ id: "loose", from: { node: "x", pin: "1" }, to: { node: "y", pin: "2" } }],
        short.analysis,
        {},
        true,
      ),
    ).toEqual({ loose: { flow: "idle", level: 0 } });
  });

  it("the serial monitor prints sensors' readings first, then the outputs' states", () => {
    const { nodes, wires, analysis } = circuit(
      [uno, part("Sonar", "hc-sr04"), part("Lamp", "led"), part("bb", "breadboard")],
      [
        "uno.5V>Sonar.VCC",
        "uno.GND1>Sonar.GND",
        "uno.D9>Sonar.TRIG",
        "uno.D10>Sonar.ECHO",
        "uno.D13>Lamp.A",
        "uno.GND2>Lamp.C",
      ],
    );
    const frame = frameAt({ nodes, wires, analysis, t: 1.25, running: true });
    const line = serialLine(nodes, frame)!;
    expect(line.startsWith("[1.3s] Sonar: ")).toBe(true);
    expect(line.indexOf("Sonar")).toBeLessThan(line.indexOf("Lamp: "));
    expect(line).not.toContain("bb");
    // Stopped, sensors give nothing; outputs still say how they are.
    expect(serialLine(nodes, frameAt({ nodes, wires, analysis, t: 0, running: false }))).toBe(
      "[0.0s] Lamp: OFF",
    );
    expect(serialLine([uno], frame)).toBeNull();
  });
});
