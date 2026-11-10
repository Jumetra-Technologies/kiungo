import { describe, expect, it } from "vitest";
import { circuit, part } from "../../../test/support/circuit";
import { getPinout } from "../pinout";
import { breadboardStrip, netFor, throughResistor, type Circuit } from "./context";
import { collectNets, joinPins } from "./nets";

/** The context the checks share, built as analyze builds it. */
function context(c: ReturnType<typeof circuit>, inputs?: Circuit["inputs"]): Circuit {
  const pinouts = new Map(c.nodes.map((n) => [n.id, getPinout(n.partId)]));
  const lookup = {
    pinOf: (r: { node: string; pin: string }) =>
      pinouts.get(r.node)?.pins.find((p) => p.id === r.pin),
    isBoard: (id: string) => pinouts.get(id)?.controller ?? false,
    isPassive: (id: string) => pinouts.get(id)?.passive ?? false,
  };
  const joined = joinPins(c.nodes, c.wires, pinouts);
  const { nets, netOfPin, netOfWire, faults } = collectNets(c.nodes, pinouts, joined, lookup);
  return {
    ...lookup,
    nodes: c.nodes,
    inputs,
    byId: new Map(c.nodes.map((n) => [n.id, n])),
    pinouts,
    nets,
    netOfPin,
    netOfWire,
    netById: new Map(nets.map((n) => [n.id, n])),
    wiredPins: new Map(),
    faults,
    reports: {},
    boardLinks: [],
  };
}

const uno = part("uno", "arduino-uno");

describe("following a net", () => {
  it("finds the net a pin is on", () => {
    const c = context(circuit([uno, part("l", "led")], ["uno.D13>l.A"]));
    expect(netFor(c, { node: "l", pin: "A" })?.kind).toBe("signal");
    expect(netFor(c, { node: "ghost", pin: "A" })).toBeUndefined();
  });

  it("through one resistor, to the board pin on its other leg, with its value", () => {
    const built = circuit(
      [uno, part("r", "resistor"), part("l", "led")],
      ["uno.D13>r.1", "r.2>l.A"],
    );
    const c = context(built, { r: { ohms: 330 } });
    const anode = netFor(c, { node: "l", pin: "A" })!;
    const hop = throughResistor(c, anode);
    expect(hop.ohms).toBe(330);
    expect(hop.net.pins.some((p) => p.node === "uno" && p.pin === "D13")).toBe(true);
    // A net that already reaches the board stays itself.
    const d13 = netFor(c, { node: "uno", pin: "D13" })!;
    expect(throughResistor(c, d13)).toEqual({ net: d13, ohms: 0 });
  });

  it("names the breadboard strip a net passes through", () => {
    const c = context(circuit([uno, part("bb", "breadboard")], ["uno.5V>bb.TP1"]));
    expect(breadboardStrip(c, netFor(c, { node: "bb", pin: "TP3" })!)).toMatch(/rail$/);
    expect(breadboardStrip(c, netFor(c, { node: "bb", pin: "a7" })!)).toBe("Column 7, a–e");
    expect(breadboardStrip(c, netFor(c, { node: "uno", pin: "D2" })!)).toBeNull();
  });
});
