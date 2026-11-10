import { describe, expect, it } from "vitest";
import { analyze } from "../circuit";
import { planAutoWire } from "../autowire";
import type { LabNode, LabWire } from "../types";
import {
  ALERT_SENSORS,
  boardOf,
  coerceInput,
  controlsFor,
  defaultOf,
  drivingSensor,
  findControl,
  inputOf,
  isSensorPart,
  isSet,
  ohmsOf,
  partsOnBoard,
} from "./for-node";

const node = (id: string, partId: string, x = 0): LabNode => ({
  id,
  partId,
  label: id,
  x,
  y: 0,
  mode: "virtual",
});
function build(...parts: string[]) {
  const uno = node("uno", "arduino-uno");
  const nodes = [uno, ...parts.map((p, i) => node(p, p, 400 + i * 80))];
  let wires: LabWire[] = [];
  for (const n of nodes.slice(1))
    wires = [
      ...wires,
      ...planAutoWire(n, nodes, wires).wires.map((w, i) => ({ id: `${n.id}-${i}`, ...w })),
    ];
  return { nodes, wires, analysis: analyze(nodes, wires) };
}

describe("controls for a part", () => {
  it("reads inputs with their declared type, and knows when the person set them", () => {
    const inputs = { a: { source: "set", distanceCm: 12, label: "x" } };
    expect(inputOf(inputs, "a", "distanceCm", 30)).toBe(12);
    expect(inputOf(inputs, "a", "label", 5)).toBe(5); // wrong type: the fallback
    expect(inputOf(undefined, "a", "distanceCm", 30)).toBe(30);
    expect(isSet(inputs, "a")).toBe(true);
    expect(isSet({ a: { source: "auto" } }, "a")).toBe(false);
  });

  it("a resistor's value, 220 Ω unless a real one is set", () => {
    expect(ohmsOf({ r: { ohms: 1000 } }, "r")).toBe(1000);
    for (const bad of [0, -5, "x", Infinity])
      expect(ohmsOf({ r: { ohms: bad as number } }, "r")).toBe(220);
    expect(ohmsOf(undefined, "r")).toBe(220);
  });

  it("clamps numbers to their range and step; toggles and choices pass only valid values", () => {
    const distance = findControl("hc-sr04", "distanceCm")!;
    expect(coerceInput(distance, 1000)).toBe(400);
    expect(coerceInput(distance, "12.6")).toBe(13);
    expect(coerceInput(distance, "far")).toBeNull();
    expect(coerceInput(findControl("pir", "motion")!, 1)).toBe(true);
    expect(coerceInput(findControl("hc-sr04", "source")!, "set")).toBe("set");
    expect(coerceInput(findControl("hc-sr04", "source")!, "magic")).toBeNull();
    expect(defaultOf("hc-sr04", "distanceCm")).toBe(30);
    expect(findControl("arduino-uno", "delayMs")).toBeDefined();
    expect(findControl("led", "nope")).toBeUndefined();
  });

  it("knows which parts are sensors, which board a part is on, and what's on a board", () => {
    expect(isSensorPart("dht11")).toBe(true);
    expect(isSensorPart("led")).toBe(false);
    expect(ALERT_SENSORS.has("hc-sr04")).toBe(true);
    const { nodes, analysis } = build("hc-sr04", "led");
    expect(boardOf("led", analysis)).toBe("uno");
    expect(boardOf("missing", analysis)).toBeNull();
    expect(partsOnBoard("uno", nodes, analysis)).toEqual(new Set(["hc-sr04", "led"]));
  });

  it("an LED with an ultrasonic sensor on its board is driven by the sketch, not a command of its own", () => {
    expect(drivingSensor("led", new Set(["hc-sr04"]))).toBe("ultrasonic sensor");
    expect(drivingSensor("servo", new Set(["pir"]))).toBe("PIR sensor");
    expect(drivingSensor("servo", new Set(["hc-sr04"]))).toBeNull();
    const { nodes, analysis } = build("hc-sr04", "led");
    const led = controlsFor(nodes[2]!, nodes, analysis);
    expect(led.controls).toEqual([]);
    expect(led.note).toMatch(/ultrasonic sensor/);
    expect(controlsFor(nodes[1]!, nodes, analysis).title).toBe("Surroundings");
    expect(controlsFor(nodes[0]!, nodes, analysis).title).toBe("Sketch settings");
  });

  it("a servo on its own takes its own command; a resistor shows its value", () => {
    const { nodes, analysis } = build("servo");
    expect(controlsFor(nodes[1]!, nodes, analysis)).toMatchObject({ title: "Command" });
    expect(controlsFor(nodes[1]!, nodes, analysis).controls.length).toBeGreaterThan(0);
    expect(controlsFor(node("r", "resistor"), nodes, analysis).title).toBe("Value");
  });
});
