import { describe, expect, it } from "vitest";
import { planAutoWire } from "./autowire";
import { breadboardUse, railSummary } from "./breadboard";
import { analyze } from "./circuit";
import { getPinout } from "./pinout";
import type { LabNode, LabWire } from "./types";
import { getPart } from "../parts";
import { BREADBOARD_SPECS } from "../parts/models/breadboard";

const node = (id: string, partId: string, x = 0, y = 0): LabNode => ({
  id,
  partId,
  label: getPart(partId)?.name.split(" (")[0] ?? partId,
  x,
  y,
  mode: "virtual",
});

let seq = 0;

const wire = (a: string, ap: string, b: string, bp: string): LabWire => ({
  id: `w${++seq}`,
  from: { node: a, pin: ap },
  to: { node: b, pin: bp },
});

const uno = node("uno", "arduino-uno", 0, 0);

const bb = node("bb", "breadboard", 420, 0);

/** The Uno's 5 V and GND on the top rails, as the lab wires a new breadboard. */
const fed = () => [wire("uno", "5V", "bb", "TP1"), wire("uno", "GND1", "bb", "TN1")];

describe("Breadboard sizes", () => {
  it("has a 170-point mini with no rails and an 830-point full-size with four 50-hole rails", () => {
    const mini = BREADBOARD_SPECS["breadboard-mini"];
    const full = BREADBOARD_SPECS["breadboard-full"];
    expect(mini!.holes).toHaveLength(170);
    expect(mini!.strips).toHaveLength(34);
    expect(Object.keys(mini!.rails)).toEqual([]);
    expect(full!.holes).toHaveLength(830);
    expect(full!.strips.filter((s) => s.length === 50)).toHaveLength(4);
    expect(full!.strips.filter((s) => s.length === 5)).toHaveLength(126);
    for (const spec of [mini, full]) {
      const part = getPart(spec!.partId)!;
      expect(part.group).toBe("prototyping");
      for (const h of spec!.holes) {
        expect(h.x, h.id).toBeGreaterThan(0);
        expect(h.x, h.id).toBeLessThan(part.size.w);
        expect(h.y, h.id).toBeLessThan(part.size.h);
      }
      for (const pin of getPinout(spec!.partId).pins)
        expect(part.canvas!.pins[pin.id], pin.id).toBeDefined();
    }
  });

  it("feeds the full-size board's top rails and leaves the mini unwired", () => {
    const full = node("full", "breadboard-full", 420, 0);
    const plan = planAutoWire(full, [uno, full], []);
    expect(plan.wires.map((w) => w.to.pin)).toEqual(["TP1", "TN1"]);
    const mini = node("mini", "breadboard-mini", 420, 0);
    expect(planAutoWire(mini, [uno, mini], []).wires).toEqual([]);
  });

  it("joins a full-size rail end to end and reports the strips in use", () => {
    const full = node("full", "breadboard-full", 420, 0);
    const wires = [wire("uno", "5V", "full", "TP1"), wire("uno", "GND1", "full", "TN50")];
    const a = analyze([uno, full], wires);
    expect(a.netOfPin.get("full:TP1")).toBe(a.netOfPin.get("full:TP50"));
    const use = breadboardUse("full", a, [uno, full]);
    expect(use.map((u) => u.name)).toEqual(["Top + rail", "Top − rail"]);
    expect(railSummary(use)).toMatch(/GND/);
  });

  it("joins a mini's columns like any other board", () => {
    const mini = node("mini", "breadboard-mini", 420, 0);
    const a = analyze([mini], []);
    expect(a.netOfPin.get("mini:a17")).toBe(a.netOfPin.get("mini:e17"));
    expect(a.netOfPin.get("mini:a17")).not.toBe(a.netOfPin.get("mini:f17"));
  });
});

describe("Connectivity", () => {
  it("joins a column's five holes and a rail's 25, but not across the channel", () => {
    const a = analyze([bb], []);
    const net = (pin: string) => a.netOfPin.get(`bb:${pin}`);
    expect(net("a7")).toBe(net("e7"));
    expect(net("a7")).not.toBe(net("f7"));
    expect(net("a7")).not.toBe(net("a8"));
    expect(net("TP1")).toBe(net("TP25"));
    expect(net("TP1")).not.toBe(net("TN1"));
    expect(net("TP1")).not.toBe(net("BP1"));
  });

  it("powers three sensors from one 5 V pin through the rails", () => {
    const parts = [node("dht", "dht11"), node("sonar", "hc-sr04"), node("pir", "pir")];
    const wires = [
      ...fed(),
      wire("bb", "TP5", "dht", "VCC"),
      wire("bb", "TN5", "dht", "GND"),
      wire("uno", "D2", "dht", "DATA"),
      wire("bb", "TP9", "sonar", "VCC"),
      wire("bb", "TN9", "sonar", "GND"),
      wire("uno", "D9", "sonar", "TRIG"),
      wire("uno", "D10", "sonar", "ECHO"),
      wire("bb", "TP13", "pir", "VCC"),
      wire("bb", "TN13", "pir", "GND"),
      wire("uno", "D4", "pir", "OUT"),
    ];
    const a = analyze([uno, bb, ...parts], wires);
    for (const p of parts) {
      expect(a.nodes[p.id]!.status, p.id).toBe("ready");
      expect(a.nodes[p.id]!.supplyV, p.id).toBe(5);
    }
    // Only one wire leaves the Uno's 5 V pin.
    expect(wires.filter((w) => w.from.node === "uno" && w.from.pin === "5V")).toHaveLength(1);
    expect(a.nodes.bb!.status).toBe("ready");
    expect(a.nodes.bb!.powered).toBe(false); // the breadboard itself is never a load
    expect(a.nets.find((n) => n.id === a.netOfPin.get("bb:TP1"))!.kind).toBe("power");
    // Its panel and badge say what the rails carry.
    const use = breadboardUse("bb", a, [uno, bb, ...parts]);
    expect(use[0]!.name).toBe("Top + rail");
    expect(use[0]!.ends).toEqual([
      "Arduino Uno 5V",
      "DHT11 humidity & temperature VCC",
      "HC-SR04 ultrasonic distance VCC",
      "PIR motion sensor VCC",
    ]);
    expect(railSummary(use)).toBe("5 V · GND");
  });

  it("links a part to a board pin through a terminal strip", () => {
    const led = node("led", "led");
    const a = analyze(
      [uno, bb, led],
      [
        ...fed(),
        wire("uno", "D13", "bb", "a12"),
        wire("bb", "e12", "led", "A"),
        wire("bb", "TN20", "led", "C"),
      ],
    );
    expect(a.nodes.led!.status).toBe("ready");
    expect(a.nodes.led!.links).toContainEqual(
      expect.objectContaining({ board: "uno", boardPin: "D13", pin: "A" }),
    );
    // A strip on the other side of the channel is not joined.
    const apart = analyze(
      [uno, bb, led],
      [
        ...fed(),
        wire("uno", "D13", "bb", "a12"),
        wire("bb", "f12", "led", "A"),
        wire("bb", "TN20", "led", "C"),
      ],
    );
    expect(apart.nodes.led!.links.some((l) => l.pin === "A")).toBe(false);
  });

  it("flags a short made on a strip, and a rail wired against its stripes", () => {
    const short = analyze(
      [uno, bb],
      [wire("uno", "5V", "bb", "c3"), wire("uno", "GND1", "bb", "d3")],
    );
    expect(short.faults.map((f) => f.title)).toContain(
      "Short circuit: power wired straight to ground",
    );
    expect(short.nodes.bb!.faults.some((f) => f.severity === "error")).toBe(true);
    const swapped = analyze(
      [uno, bb],
      [wire("uno", "GND1", "bb", "TP1"), wire("uno", "5V", "bb", "TN1")],
    );
    const titles = swapped.nodes.bb!.faults.map((f) => f.title);
    expect(titles).toContain("GND on the Top + rail");
    expect(titles).toContain("5 V on the Top − rail");
  });

  it("says when a part is on a rail that nothing feeds", () => {
    const dht = node("dht", "dht11");
    const a = analyze(
      [uno, bb, dht],
      [
        wire("bb", "BP3", "dht", "VCC"),
        wire("bb", "BN3", "dht", "GND"),
        wire("uno", "D2", "dht", "DATA"),
      ],
    );
    const detail = a.nodes.dht!.faults.find((f) => f.title === "No power")!.detail;
    expect(detail).toMatch(/breadboard's Bottom \+ rail, which has no supply yet/);
  });
});
