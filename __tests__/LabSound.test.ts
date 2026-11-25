import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "@kiungo/core/lab/circuit";
import { planAutoWire } from "@kiungo/core/lab/autowire";
import { ACTIVE_BUZZER_HZ, frameAt } from "@kiungo/core/lab/simulate";
import { LabSound, edgesBetween, isHigh, type SoundState } from "@kiungo/core/lab/sound";
import type { LabNode, LabWire } from "@kiungo/core/lab/types";

/** A sound card you can read: records every gain change with its time. */
class FakeParam {
  value = 0;
  events: Array<{ kind: string; value: number; at: number }> = [];
  setTargetAtTime(value: number, at: number) {
    this.events.push({ kind: "target", value, at });
  }
  exponentialRampToValueAtTime(value: number, at: number) {
    this.events.push({ kind: "ramp", value, at });
  }
  setValueAtTime(value: number, at: number) {
    this.events.push({ kind: "set", value, at });
  }
  cancelScheduledValues(at: number) {
    this.events.push({ kind: "cancel", value: 0, at });
  }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = "";
  stopped: number | null = null;
  started = false;
  connect(next: FakeNode) {
    return next;
  }
  start() {
    this.started = true;
  }
  stop(at: number) {
    this.stopped = at;
  }
}
class FakeContext {
  currentTime = 0;
  state = "running";
  destination = new FakeNode();
  gains: FakeNode[] = [];
  oscillators: FakeNode[] = [];
  createGain() {
    const n = new FakeNode();
    this.gains.push(n);
    return n;
  }
  createOscillator() {
    const n = new FakeNode();
    this.oscillators.push(n);
    return n;
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  sampleRate = 44100;
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() {
    const n = new FakeNode() as FakeNode & { buffer: unknown };
    return n;
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

let ctx: FakeContext;
const make = () => {
  const engine = new LabSound(() => ctx as unknown as AudioContext);
  engine.unlock();
  return engine;
};
/** The buzzer's gate: gains[0] is the master, gains[1] the first voice. */
const gate = (i = 1) => ctx.gains[i].gain.events;
const opens = (i = 1) => gate(i).filter((e) => e.kind === "target" && e.value === 1);
const beep = { period: 0.3, duty: 0.5, phase: 0 };
const state = (over: Partial<SoundState> = {}): SoundState => ({ running: true, t: 0, speed: 1, voices: [{ id: "bz", hz: ACTIVE_BUZZER_HZ, pattern: beep }], ...over });

/** Advance real time: the sound card's clock and the engine's 25 ms pump together. */
function play(seconds: number) {
  for (let i = 0; i < Math.round(seconds / 0.025); i++) {
    ctx.currentTime = Math.round((ctx.currentTime + 0.025) * 1e6) / 1e6;
    vi.advanceTimersByTime(25);
  }
}

beforeEach(() => {
  ctx = new FakeContext();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Pin patterns", () => {
  it("matches the simulation's on/off rule and lists every edge", () => {
    expect(isHigh(beep, 0.1)).toBe(true);
    expect(isHigh(beep, 0.2)).toBe(false);
    expect(edgesBetween(beep, 0, 0.6)).toEqual([
      { t: 0.15, on: false },
      { t: 0.3, on: true },
      { t: expect.closeTo(0.45, 9), on: false },
      { t: 0.6, on: true },
    ]);
    expect(edgesBetween({ period: 1, duty: 0.15, phase: 0.2 }, 0, 1)).toEqual([{ t: expect.closeTo(0.8, 9), on: true }, { t: expect.closeTo(0.95, 9), on: false }]);
    expect(edgesBetween(beep, 1, 1)).toEqual([]);
    expect(edgesBetween({ period: 0, duty: 0.5, phase: 0 }, 0, 1)).toEqual([]);
  });
});

describe("The buzzer's sound", () => {
  it("is a square wave at the buzzer's pitch through a piezo resonance, gated by the pin", () => {
    const engine = make();
    engine.update(state());
    const osc = ctx.oscillators[0];
    expect(osc.type).toBe("square");
    expect(osc.started).toBe(true);
    // A small per-part detune, as real buzzers differ.
    expect(Math.abs((osc.frequency.value as number) / ACTIVE_BUZZER_HZ - 1)).toBeLessThanOrEqual(0.015);
    // Pin high at t=0: the gate opens straight away.
    expect(opens()[0].at).toBe(0);
  });

  it("beeps on the sound card's clock in step with the sketch: 150 ms on, 150 ms off", () => {
    const engine = make();
    engine.update(state());
    play(1.2);
    const times = opens().map((e) => Number(e.at.toFixed(3)));
    expect(times.slice(0, 4)).toEqual([0, 0.3, 0.6, 0.9]);
    const closes = gate().filter((e) => e.kind === "target" && e.value === 0).map((e) => Number(e.at.toFixed(3)));
    expect(closes.slice(0, 3)).toEqual([0.15, 0.45, 0.75]);
    engine.dispose();
  });

  it("beeps twice as often at 2× speed", () => {
    const engine = make();
    engine.update(state({ speed: 2 }));
    play(1.2);
    expect(opens().map((e) => Number(e.at.toFixed(3))).slice(0, 4)).toEqual([0, 0.15, 0.3, 0.45]);
    engine.dispose();
  });

  it("stops when the sketch stops driving it, when the run stops, and when muted", () => {
    const engine = make();
    engine.update(state());
    engine.update(state({ voices: [] }));
    expect(ctx.oscillators[0].stopped).not.toBeNull();
    engine.update(state());
    engine.update(state({ running: false }));
    expect(ctx.oscillators[1].stopped).not.toBeNull();
    engine.update(state());
    engine.setEnabled(false);
    expect(ctx.gains[0].gain.events.at(-1)).toMatchObject({ value: 0 });
    expect(ctx.oscillators[2].stopped).not.toBeNull();
    engine.dispose();
  });

  it("does nothing until a click unlocks audio", () => {
    const engine = new LabSound(() => ctx as unknown as AudioContext);
    engine.update(state());
    expect(ctx.oscillators).toHaveLength(0);
    engine.unlock();
    expect(ctx.oscillators).toHaveLength(1);
  });

  it("re-syncs after a reset instead of carrying on from the old time", () => {
    const engine = make();
    engine.update(state({ t: 0 }));
    play(0.5);
    // The lab jumps back to t=0 (Reset) and runs again.
    engine.update(state({ t: 0 }));
    expect(gate().some((e) => e.kind === "cancel" && e.at === ctx.currentTime)).toBe(true);
    engine.dispose();
  });
});

describe("What the simulation asks the buzzer to do", () => {
  let seq = 0;
  const node = (partId: string, x = 0, y = 0): LabNode => ({ id: `s${++seq}`, partId, label: partId, x, y, mode: "virtual" });
  function build(...parts: string[]) {
    const uno = node("arduino-uno");
    const nodes = [uno];
    let wires: LabWire[] = [];
    for (const p of parts) {
      const n = node(p, 600, nodes.length * 200);
      nodes.push(n);
      wires = [...wires, ...planAutoWire(n, nodes, wires).wires.map((w) => ({ id: `w${++seq}`, ...w }))];
    }
    return { uno, nodes, wires, analysis: analyze(nodes, wires) };
  }

  it("beeps fast while an obstacle is too close, and is silent otherwise", () => {
    const { uno, nodes, wires, analysis } = build("hc-sr04", "buzzer");
    const us = nodes.find((n) => n.partId === "hc-sr04")!.id;
    const bz = nodes.find((n) => n.partId === "buzzer")!.id;
    const near = frameAt(nodes, wires, analysis, 1, true, { [us]: { source: "set", distanceCm: 5 }, [uno.id]: { warnCm: 20 } });
    expect(near.nodes[bz].tone).toEqual({ hz: ACTIVE_BUZZER_HZ, pattern: { period: 0.3, duty: 0.5, phase: 0 } });
    const far = frameAt(nodes, wires, analysis, 1, true, { [us]: { source: "set", distanceCm: 50 }, [uno.id]: { warnCm: 20 } });
    expect(far.nodes[bz].tone).toBeNull();
    expect(frameAt(nodes, wires, analysis, 1, false).nodes[bz].tone ?? null).toBeNull();
  });

  it("chirps once per blink period, following the board's delay, with no sensor", () => {
    const { uno, nodes, wires, analysis } = build("buzzer");
    const bz = nodes.find((n) => n.partId === "buzzer")!.id;
    expect(frameAt(nodes, wires, analysis, 1, true).nodes[bz].tone?.pattern).toMatchObject({ period: 1, duty: 0.15 });
    expect(frameAt(nodes, wires, analysis, 1, true, { [uno.id]: { delayMs: 1000 } }).nodes[bz].tone?.pattern).toMatchObject({ period: 2 });
  });
});

describe("The USB lead", () => {
  it("has the plug each board really takes", async () => {
    const { connectorFor } = await import("@kiungo/lab/UsbCable");
    expect(connectorFor("arduino-uno")).toBe("usb-b");
    expect(connectorFor("arduino-mega")).toBe("usb-b");
    expect(connectorFor("esp32")).toBe("micro-usb");
    expect(connectorFor("raspberry-pi-pico")).toBe("micro-usb");
    expect(connectorFor("raspberry-pi-4")).toBe("usb-c");
  });

  it("clicks when the plug seats, only with sound on", () => {
    const engine = make();
    const before = ctx.oscillators.length;
    engine.click(0.38);
    expect(ctx.oscillators.length).toBe(before + 1);
    engine.setEnabled(false);
    engine.click();
    expect(ctx.oscillators.length).toBe(before + 1);
  });
});
