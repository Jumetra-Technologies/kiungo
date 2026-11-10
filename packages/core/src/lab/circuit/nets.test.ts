import { describe, expect, it } from "vitest";
import { circuit, part } from "../../../test/support/circuit";
import { getPinout } from "../pinout";
import { DisjointSet, collectNets, joinPins, nameOf } from "./nets";

const uno = part("uno", "arduino-uno");
const netOf = (a: ReturnType<typeof circuit>["analysis"], pin: string) =>
  a.nets.find((n) => n.id === a.netOfPin.get(pin));

describe("joining pins into nets", () => {
  it("a disjoint set joins and finds", () => {
    const set = new DisjointSet();
    for (const k of ["a", "b", "c", "d"]) set.add(k);
    set.union("a", "b");
    set.union("c", "d");
    set.union("b", "d");
    expect(set.find("a")).toBe(set.find("c"));
    expect(set.find("x")).toBe("x"); // unknown keys are their own root
  });

  it("a board's grounds are one net, and so are its pins on the same supply", () => {
    const pinouts = new Map([["uno", getPinout("arduino-uno")]]);
    const { set } = joinPins([uno], [], pinouts);
    expect(set.find("uno:GND1")).toBe(set.find("uno:GND2"));
    expect(set.find("uno:5V")).toBe(set.find("uno:5V_ICSP"));
    expect(set.find("uno:5V")).not.toBe(set.find("uno:3V3"));
  });

  it("a breadboard's strip is one net; wires to parts that aren't there are dropped", () => {
    const bb = part("bb", "breadboard");
    const pinouts = new Map([
      ["uno", getPinout("arduino-uno")],
      ["bb", getPinout("breadboard")],
    ]);
    const wires = [
      { id: "w1", from: { node: "uno", pin: "D2" }, to: { node: "bb", pin: "a1" } },
      { id: "w2", from: { node: "ghost", pin: "X" }, to: { node: "bb", pin: "b1" } },
    ];
    const { set, validWires } = joinPins([uno, bb], wires, pinouts);
    expect(set.find("bb:a1")).toBe(set.find("bb:e1"));
    expect(set.find("bb:a1")).not.toBe(set.find("bb:f1")); // not across the channel
    expect(set.find("uno:D2")).toBe(set.find("bb:c1"));
    expect(validWires.map((w) => w.id)).toEqual(["w1"]);
  });
});

describe("what each net is", () => {
  it("power, ground, signal or open, with a name people use", () => {
    const { analysis } = circuit([uno, part("l", "led")], ["uno.D13>l.A", "uno.GND1>l.C"]);
    expect(netOf(analysis, "uno:5V")).toMatchObject({
      kind: "power",
      voltage: 5,
      label: "5 V rail",
    });
    expect(netOf(analysis, "uno:GND1")).toMatchObject({ kind: "ground", label: "GND" });
    expect(netOf(analysis, "uno:D13")).toMatchObject({ kind: "signal", label: "D13" });
    expect(netOf(analysis, "uno:D2")).toMatchObject({ kind: "open" });
    expect(analysis.netOfWire.size).toBe(2);
  });

  it("a supply on ground is a short; two supplies joined are a conflict", () => {
    const short = circuit([uno], ["uno.5V>uno.GND1"]).analysis;
    expect(netOf(short, "uno:5V")).toMatchObject({ kind: "short", label: "Short" });
    expect(short.faults[0]!.id).toMatch(/^short:uno:/);
    const conflict = circuit([uno], ["uno.5V>uno.3V3"]).analysis;
    expect(netOf(conflict, "uno:5V")).toMatchObject({ kind: "conflict", voltage: 5 });
    expect(conflict.faults.find((f) => f.id.startsWith("conflict:"))?.detail).toMatch(
      /3.3 V and 5 V rails/,
    );
  });

  it("two parts' outputs on one wire contend", () => {
    const a = circuit(
      [uno, part("s", "soil-moisture"), part("u", "hc-sr04")],
      ["uno.D2>s.D0", "uno.D2>u.ECHO"],
    ).analysis;
    expect(a.faults.find((f) => f.id.startsWith("contention:"))).toMatchObject({
      severity: "warning",
      nodes: ["s", "u"],
    });
  });

  it("collects nets straight from joined pins", () => {
    const pinouts = new Map([["uno", getPinout("arduino-uno")]]);
    const lookup = {
      pinOf: (r: { node: string; pin: string }) =>
        pinouts.get(r.node)?.pins.find((p) => p.id === r.pin),
      isBoard: () => true,
      isPassive: () => false,
    };
    const { nets, faults } = collectNets([uno], pinouts, joinPins([uno], [], pinouts), lookup);
    expect(nets.length).toBeLessThan(getPinout("arduino-uno").pins.length); // rails and grounds merged
    expect(faults).toEqual([]);
  });

  it("names parts by their label, else by their catalog name", () => {
    expect(nameOf({ ...uno, label: "My Uno" })).toBe("My Uno");
    expect(nameOf({ ...uno, label: "" })).toMatch(/Arduino Uno/);
    expect(nameOf({ ...uno, partId: "nothing", label: "" })).toBe("nothing");
  });
});
