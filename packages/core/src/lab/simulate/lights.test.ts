import { wired } from "../../../test/support/lab";
import { describe, expect, it } from "vitest";
import { analyze, ledCurrentMa } from "../circuit";
import { planAutoWire } from "../autowire";
import { coerceInput, findControl } from "../controls";
import { frameAt } from "./";
import type { LabNode, LabWire, NodeInputs } from "../types";

let seq = 0;

const node = (partId: string, x = 0, y = 0): LabNode => ({
  id: `q${++seq}`,
  partId,
  label: partId === "dht11" ? "DHT11" : partId,
  x,
  y,
  mode: "virtual",
});

function build(boardId: string, ...peripherals: string[]) {
  const board = node(boardId);
  const nodes = [board];
  let wires: LabWire[] = [];
  const parts: Record<string, LabNode> = {};
  for (const p of peripherals) {
    const n = node(p, 600, nodes.length * 200);
    nodes.push(n);
    parts[p] = n;
    wires = [
      ...wires,
      ...planAutoWire(n, nodes, wires).wires.map((w) => ({ id: `w${++seq}`, ...w })),
    ];
  }
  const analysis = analyze(nodes, wires);
  const at = (t: number, inputs?: Record<string, NodeInputs>, running = true) =>
    frameAt({ nodes, wires, analysis, t, running, inputs });
  return { board, parts, nodes, wires, analysis, at };
}

const set = (nodeId: string, values: NodeInputs): Record<string, NodeInputs> => ({
  [nodeId]: { source: "set", ...values },
});

const merge = (...all: Array<Record<string, NodeInputs>>) =>
  Object.assign({}, ...all) as Record<string, NodeInputs>;

const reading = (f: ReturnType<typeof frameAt>, id: string, label: string) =>
  f.nodes[id]!.readings.find((r) => r.label === label)?.value;

describe("P1 · Experiment 01: LDR-controlled LED and the resistor tip", () => {
  it("the LED is on while light < Dark below (30 % by default): 29 on, 30 and 31 off; 0 and 100 at the ends", () => {
    const { parts, at } = build("arduino-uno", "ldr", "led");
    const led = (light: number) => at(2, set(parts.ldr!.id, { light })).nodes[parts.led!.id]!.on;
    expect([0, 29, 30, 31, 100].map(led)).toEqual([true, true, false, false, false]);
    // Out of range is clamped to the slider's ends.
    expect(coerceInput(findControl("ldr", "light")!, -5)).toBe(0);
    expect(coerceInput(findControl("ldr", "light")!, 140)).toBe(100);
  });

  it("the threshold is the board's Dark below setting", () => {
    const { board, parts, at } = build("arduino-uno", "ldr", "led");
    const inputs = merge(set(parts.ldr!.id, { light: 45 }), { [board.id]: { darkPct: 50 } });
    expect(at(2, inputs).nodes[parts.led!.id]!.on).toBe(true);
  });

  it("holds its state while the light doesn't change, and switches back and forth repeatably", () => {
    const { parts, at } = build("arduino-uno", "ldr", "led");
    for (const [light, on] of [
      [20, true],
      [40, false],
      [20, true],
      [40, false],
    ] as const) {
      for (let t = 1; t < 6; t += 0.5)
        expect(at(t, set(parts.ldr!.id, { light })).nodes[parts.led!.id]!.on).toBe(on);
    }
  });

  it("with no resistor wired, the tip and the reading both assume 220 Ω", () => {
    const { parts, analysis, at } = build("arduino-uno", "ldr", "led");
    const tip = analysis.nodes[parts.led!.id]!.faults.find((f) => f.id.startsWith("resistor"))!;
    expect(tip.severity).toBe("tip");
    expect(tip.title).toBe("Assumed: 220 Ω resistor in series");
    expect(tip.detail).toMatch(
      /No resistor is wired.*220 Ω.*5 V pin.*13\.6 mA.*Add a Resistor part/,
    );
    expect(
      reading(at(2, set(parts.ldr!.id, { light: 10 })), parts.led!.id, "Current (modeled)"),
    ).toBe("13.6 mA via 220 Ω (assumed)");
    expect(
      reading(at(2, set(parts.ldr!.id, { light: 90 })), parts.led!.id, "Current (modeled)"),
    ).toBe("0 mA");
    // On a 3.3 V board the same resistor gives less.
    const esp = build("esp32", "led");
    expect(
      esp.analysis.nodes[esp.parts.led!.id]!.faults.find((f) => f.id.startsWith("resistor"))!
        .detail,
    ).toMatch(/3\.3 V pin.*5\.9 mA/);
    expect(ledCurrentMa(5)).toBeCloseTo(13.64, 2);
  });
});

describe("The resistor part", () => {
  const led = (ohms?: number, side: "anode" | "cathode" = "anode") => {
    const uno = {
      id: "uno",
      partId: "arduino-uno",
      label: "Uno",
      x: 0,
      y: 0,
      mode: "virtual" as const,
    };
    const r = {
      id: "r1",
      partId: "resistor",
      label: "Resistor",
      x: 0,
      y: 0,
      mode: "virtual" as const,
    };
    const l = { id: "led", partId: "led", label: "LED", x: 0, y: 0, mode: "virtual" as const };
    const w = (a: string, ap: string, b: string, bp: string, id: string) => ({
      id,
      from: { node: a, pin: ap },
      to: { node: b, pin: bp },
    });
    const wires =
      side === "anode"
        ? [
            w("uno", "D13", "r1", "1", "w1"),
            w("r1", "2", "led", "A", "w2"),
            w("led", "C", "uno", "GND1", "w3"),
          ]
        : [
            w("uno", "D13", "led", "A", "w1"),
            w("led", "C", "r1", "1", "w2"),
            w("r1", "2", "uno", "GND1", "w3"),
          ];
    const inputs: Record<string, NodeInputs> = ohms ? { r1: { ohms: String(ohms) } } : {};
    const nodes = [uno, r, l];
    return { nodes, wires, inputs, analysis: analyze(nodes, wires, inputs) };
  };

  it("drives an LED through it, on either side, and uses its real value", () => {
    for (const side of ["anode", "cathode"] as const) {
      const { analysis } = led(220, side);
      const report = analysis.nodes.led;
      expect(report!.status, side).toBe("ready");
      expect(report!.seriesOhms, side).toBe(220);
      expect(
        report!.faults.map((f) => f.id),
        side,
      ).not.toContain(expect.stringMatching(/^resistor/));
      expect(
        report!.links.some((l) => l.boardPin === "D13"),
        side,
      ).toBe(true);
    }
    const { nodes, wires, inputs, analysis } = led(1000);
    const frame = frameAt({ nodes, wires, analysis, t: 0.2, running: true, inputs });
    expect(frame.nodes.led!.readings.find((r) => r.label === "Current")?.value).toBe(
      "3.0 mA via 1 kΩ",
    );
    expect(frame.nodes.r1!.readings[0]).toEqual({ label: "Value", value: "1 kΩ" });
  });

  it("warns when the resistor is too small for the LED", () => {
    const f = led(100).analysis.nodes.led!.faults.find((x) => x.id.startsWith("too-much-current"))!;
    expect(f.severity).toBe("warning");
    expect(f.title).toBe("30 mA: more than the LED takes");
    expect(f.detail).toMatch(/Use at least 150 Ω/);
    expect(
      led(220).analysis.nodes.led!.faults.some((x) => x.id.startsWith("too-much-current")),
    ).toBe(false);
  });

  it("goes in series with an LED wired straight to a pin when auto-wired", () => {
    const uno = {
      id: "uno",
      partId: "arduino-uno",
      label: "Uno",
      x: 0,
      y: 0,
      mode: "virtual" as const,
    };
    const l = { id: "led", partId: "led", label: "LED", x: 0, y: 0, mode: "virtual" as const };
    const r = {
      id: "r1",
      partId: "resistor",
      label: "Resistor",
      x: 0,
      y: 0,
      mode: "virtual" as const,
    };
    const wires = [
      { id: "wa", from: { node: "uno", pin: "D13" }, to: { node: "led", pin: "A" } },
      { id: "wc", from: { node: "uno", pin: "GND1" }, to: { node: "led", pin: "C" } },
    ];
    const plan = planAutoWire(r, [uno, l, r], wires);
    expect(plan.remove).toEqual(["wa"]);
    expect(plan.wires).toEqual([
      { from: { node: "uno", pin: "D13" }, to: { node: "r1", pin: "1" } },
      { from: { node: "led", pin: "A" }, to: { node: "r1", pin: "2" } },
    ]);
    const after = [
      ...wires.filter((w) => w.id !== "wa"),
      ...plan.wires.map((w, i) => ({ id: `n${i}`, ...w })),
    ];
    expect(analyze([uno, l, r], after).nodes.led!.seriesOhms).toBe(220);
  });
});

describe("lights and sounders in every state", () => {
  const value = (live: { readings: Array<{ label: string; value: string }> }, label: string) =>
    live.readings.find((r) => r.label === label)?.value;

  it("an LED blinks at the board's delay; stopped, it's off", () => {
    const { at } = wired("arduino-uno", "led");
    expect(at(0.25).nodes.led).toMatchObject({ on: true, badge: "ON" });
    expect(at(0.75).nodes.led).toMatchObject({ on: false, badge: "OFF" });
    expect(value(at(0.25).nodes.led!, "Sketch")).toBe("Blinking, 500 ms");
    expect(value(at(0.25).nodes.led!, "Current (modeled)")).toMatch(/mA via 220 Ω \(assumed\)$/);
    expect(at(0.25, { running: false }).nodes.led!.readings).toEqual([
      { label: "State", value: "Off" },
    ]);
  });

  it("an LED on a supply rail is always on, even stopped", () => {
    const { nodes, wires } = wired("arduino-uno", "led");
    const onRail = wires.map((w) =>
      w.to.node === "led" && w.to.pin === "A" ? { ...w, from: { node: "board", pin: "5V" } } : w,
    );
    const analysis = analyze(nodes, onRail);
    expect(frameAt({ nodes, wires: onRail, analysis, t: 0.75, running: true }).nodes.led!.on).toBe(
      true,
    );
    expect(frameAt({ nodes, wires: onRail, analysis, t: 0.75, running: false }).nodes.led!.on).toBe(
      true,
    );
  });

  it("with an alert sensor on the board, outputs follow its condition", () => {
    const { at } = wired("arduino-uno", "hc-sr04", "led", "buzzer", "relay");
    const near = at(0.1, { inputs: { "hc-sr04": { source: "set", distanceCm: 5 } } });
    expect(near.nodes.led!.on).toBe(true);
    expect(value(near.nodes.led!, "Sketch")).toBe("On: hc-sr04 condition met");
    expect(near.nodes.buzzer!.tone).toEqual({
      hz: 2300,
      pattern: { period: 0.3, duty: 0.5, phase: 0 },
    });
    expect(near.nodes.relay).toMatchObject({
      on: true,
      badge: "Energised",
      readings: [{ value: "COM–NO closed" }],
    });
    const far = at(0.1, { inputs: { "hc-sr04": { source: "set", distanceCm: 300 } } });
    expect(far.nodes.led!.on).toBe(false);
    expect(value(far.nodes.led!, "Sketch")).toBe("Off: waiting on hc-sr04");
    expect(far.nodes.buzzer).toMatchObject({ tone: null, badge: "Quiet" });
    expect(far.nodes.relay!.badge).toBe("Released");
  });

  it("without one, a buzzer chirps and a relay clicks at the blink rate", () => {
    const { at } = wired("arduino-uno", "buzzer", "relay");
    expect(at(0.05).nodes.buzzer).toMatchObject({
      on: true,
      badge: "BEEP",
      tone: { hz: 2300, pattern: { period: 1, duty: 0.15 } },
    });
    expect(at(0.5).nodes.buzzer).toMatchObject({
      on: false,
      badge: "Beeping",
      readings: [{ value: "Beeping" }],
    });
    expect(at(0.5, { running: false }).nodes.buzzer).toMatchObject({
      tone: null,
      readings: [{ value: "Silent" }],
    });
    expect(at(0.5).nodes.relay!.on).toBe(true);
    expect(at(0.5, { running: false }).nodes.relay!.on).toBe(false);
  });

  it("an RGB LED fades only the colors that are wired", () => {
    const { nodes, wires } = wired("arduino-uno", "rgb-led");
    const noBlue = wires.filter((w) => !(w.to.node === "rgb-led" && w.to.pin === "B"));
    const live = frameAt({
      nodes,
      wires: noBlue,
      analysis: analyze(nodes, noBlue),
      t: 1,
      running: true,
    }).nodes["rgb-led"]!;
    expect(live.rgb![2]).toBe(0);
    expect(live.rgb![0]).toBeGreaterThan(0);
    expect(live.badge).toBe("Fading");
    expect(
      wired("arduino-uno", "rgb-led").at(1, { running: false }).nodes["rgb-led"],
    ).toMatchObject({ rgb: [0, 0, 0], badge: "Off" });
  });
});
