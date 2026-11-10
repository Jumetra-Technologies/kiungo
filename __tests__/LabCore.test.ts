import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTS, getPart } from "@kiungo/core/parts";
import { PINOUTS, getPinout, hasPinout } from "@kiungo/core/lab/pinout";
import { analyze } from "@kiungo/core/lab/circuit";
import { planAutoWire, placeNode, nodeBox } from "@kiungo/core/lab/autowire";
import { frameAt, serialLine } from "@kiungo/core/lab/simulate";
import { describeChanges, RunRecorder } from "@kiungo/core/lab/activity";
import { fitFor, suggest } from "@kiungo/core/lab/suggest";
import { runCommand, tokenize, type TerminalApi } from "@kiungo/core/lab/terminal";
import { LAB_STORAGE_KEY, flushLab, labKeyFor, nextLabel, readLabData, setLabOwner, useLab } from "@kiungo/lab/store";
import type { LabNode, LabWire } from "@kiungo/core/lab/types";

let seq = 0;
const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({ id: `n${++seq}`, partId, label: label ?? partId, x, y, mode: "virtual" });
const wire = (a: LabNode, ap: string, b: LabNode, bp: string): LabWire => ({ id: `w${++seq}`, from: { node: a.id, pin: ap }, to: { node: b.id, pin: bp } });
const autowired = (boardId: string, partId: string) => {
  const board = node(boardId, 0, 0, "Board");
  const part = node(partId, 500, 0, "Part");
  const plan = planAutoWire(part, [board, part], []);
  const wires = plan.wires.map((w) => ({ id: `w${++seq}`, ...w }));
  return { board, part, wires, plan, analysis: analyze([board, part], wires) };
};

describe("pinouts", () => {
  it("covers every catalogue part with unique pin ids", () => {
    for (const part of PARTS) {
      expect(hasPinout(part.id), part.id).toBe(true);
      const ids = getPinout(part.id).pins.map((p) => p.id);
      expect(new Set(ids).size, part.id).toBe(ids.length);
    }
    expect(PINOUTS).toHaveLength(PARTS.length);
  });

  it("gives every board a supply and a ground, every peripheral a role per pin, and every breadboard hole a strip", () => {
    for (const pinout of PINOUTS) {
      if (pinout.passive && !pinout.strips) {
        // A resistor: two legs, no polarity, nothing joined inside.
        expect(pinout.pins.map((p) => p.id), pinout.partId).toEqual(["1", "2"]);
      } else if (pinout.passive) {
        const inStrips = new Set(pinout.strips!.flat());
        expect(pinout.pins.every((p) => inStrips.has(p.id)), pinout.partId).toBe(true);
      } else if (pinout.controller) {
        expect(pinout.pins.some((p) => p.supplies), pinout.partId).toBe(true);
        expect(pinout.pins.some((p) => p.fns?.includes("ground")), pinout.partId).toBe(true);
      } else {
        expect(pinout.pins.every((p) => p.role), pinout.partId).toBe(true);
        expect(pinout.supply, pinout.partId).toBeDefined();
      }
    }
  });
});

describe("auto-wiring", () => {
  it("wires every peripheral to an Uno so it is ready, except 3.3 V-only LoRa signals", () => {
    // A resistor has nothing to wire to on its own; its auto-wiring (in series with an LED) is tested in LabAcceptance.
    // A mini breadboard has no rails to feed, so it stays unwired (tested in Breadboard).
    for (const part of PARTS.filter((p) => !getPinout(p.id).controller && p.id !== "resistor" && p.id !== "breadboard-mini")) {
      const { part: n, analysis, plan } = autowired("arduino-uno", part.id);
      expect(plan.skipped, part.id).toEqual([]);
      const errors = analysis.nodes[n.id].faults.filter((f) => f.severity === "error");
      if (part.id === "lora") {
        expect(errors.map((f) => f.title)).toContain("5 V signal into a 3.3 V input");
      } else {
        expect(analysis.nodes[n.id].status, part.id).toBe("ready");
        expect(errors, part.id).toEqual([]);
      }
    }
  });

  it("powers 3.3 V parts from 3.3 V and puts an LED on the board's LED pin", () => {
    const radio = autowired("arduino-uno", "nrf24l01");
    const vcc = radio.wires.find((w) => w.to.pin === "VCC")!;
    expect(vcc.from.pin).toBe("3V3");
    const led = autowired("arduino-uno", "led");
    expect(led.wires.find((w) => w.to.pin === "A")!.from.pin).toBe("D13");
  });

  it("uses the I²C pins for I²C parts and crosses serial lines", () => {
    const oled = autowired("esp32", "oled-ssd1306");
    expect(oled.wires.find((w) => w.to.pin === "SDA")!.from.pin).toBe("D21");
    expect(oled.wires.find((w) => w.to.pin === "SCL")!.from.pin).toBe("D22");
    const bt = autowired("arduino-mega", "hc-05");
    expect(bt.wires.find((w) => w.to.pin === "TXD")!.from.pin).toBe("D19");
    expect(bt.wires.find((w) => w.to.pin === "RXD")!.from.pin).toBe("D18");
  });

  it("never plans wires without a board", () => {
    const led = node("led");
    expect(planAutoWire(led, [led], []).wires).toEqual([]);
  });

  it("places new parts where they don't overlap", () => {
    const board = node("arduino-uno", 80, 80);
    const a = { ...node("led"), ...placeNode("led", [board], board) };
    const b = { ...node("dht11"), ...placeNode("dht11", [board, a], board) };
    const overlap = (p: LabNode, q: LabNode) => {
      const bp = nodeBox(p.partId);
      const bq = nodeBox(q.partId);
      return p.x < q.x + bq.w && p.x + bp.w > q.x && p.y < q.y + bq.h && p.y + bp.h > q.y;
    };
    expect(overlap(board, a)).toBe(false);
    expect(overlap(a, b)).toBe(false);
    expect(a.x).toBeGreaterThan(board.x);
  });
});

describe("circuit analysis", () => {
  it("finds a missing ground and a missing supply", () => {
    const uno = node("arduino-uno");
    const led = node("led");
    const a = analyze([uno, led], [wire(uno, "D13", led, "A")]);
    expect(a.nodes[led.id].status).toBe("fault");
    expect(a.nodes[led.id].faults.map((f) => f.title)).toContain("No path to ground");

    const dht = node("dht11");
    const b = analyze([uno, dht], [wire(uno, "D2", dht, "DATA"), wire(uno, "GND1", dht, "GND")]);
    expect(b.nodes[dht.id].faults.map((f) => f.title)).toContain("No power");
  });

  it("flags a short from a supply to ground", () => {
    const uno = node("arduino-uno");
    const a = analyze([uno], [wire(uno, "5V", uno, "GND1")]);
    expect(a.faults[0]).toMatchObject({ severity: "error", title: expect.stringContaining("Short circuit") });
    expect(a.nodes[uno.id].powered).toBe(false);
  });

  it("flags too much voltage on a 3.3 V part", () => {
    const uno = node("arduino-uno");
    const radio = node("nrf24l01");
    const a = analyze([uno, radio], [wire(uno, "5V", radio, "VCC"), wire(uno, "GND1", radio, "GND")]);
    expect(a.nodes[radio.id].faults.find((f) => f.title.includes("3.6 V part"))?.severity).toBe("error");
  });

  it("flags swapped I²C lines and TX wired to TX", () => {
    const uno = node("arduino-uno");
    const lcd = node("lcd-16x2");
    const a = analyze([uno, lcd], [wire(uno, "5V", lcd, "VCC"), wire(uno, "GND1", lcd, "GND"), wire(uno, "A5", lcd, "SDA"), wire(uno, "A4", lcd, "SCL")]);
    expect(a.faults.filter((f) => f.title === "SDA and SCL swapped")).toHaveLength(2);

    const pi = node("raspberry-pi-4");
    const b = analyze([uno, pi], [wire(uno, "D1", pi, "GPIO14"), wire(uno, "GND1", pi, "GND1")]);
    expect(b.faults.map((f) => f.title)).toContain("TX wired to TX");
    // And the Uno's 5 V TX would hurt the Pi's 3.3 V pin.
    expect(b.faults.map((f) => f.title)).toContain("5 V signal into a 3.3 V board");
  });

  it("asks for a common ground between boards that talk", () => {
    const uno = node("arduino-uno");
    const pi = node("raspberry-pi-4");
    const a = analyze([uno, pi], [wire(uno, "D2", pi, "GPIO4")]);
    expect(a.faults.map((f) => f.title)).toContain("No common ground between boards");
    expect(a.boardLinks[0]).toMatchObject({ a: uno.id, b: pi.id, bus: "gpio" });
  });

  it("knows input-only pins can't drive an LED, and digital pins can't read analog", () => {
    const esp = node("esp32");
    const led = node("led");
    const a = analyze([esp, led], [wire(esp, "D34", led, "A"), wire(esp, "GND1", led, "C")]);
    expect(a.nodes[led.id].faults.map((f) => f.title)).toContain("GPIO34 can't drive outputs");

    const uno = node("arduino-uno");
    const ldr = node("ldr");
    const b = analyze([uno, ldr], [wire(uno, "5V", ldr, "L1"), wire(uno, "D7", ldr, "L2")]);
    expect(b.nodes[ldr.id].faults.map((f) => f.title)).toContain("D7 can't read analog");
    expect(b.nodes[ldr.id].status).toBe("ready");
  });

  it("joins a board's grounds and its same-voltage supply pins into single nets", () => {
    const uno = node("arduino-uno");
    const a = analyze([uno], []);
    const net = (pin: string) => a.netOfPin.get(`${uno.id}:${pin}`);
    expect(net("GND1")).toBe(net("GND3"));
    expect(net("5V")).toBe(net("5V_ICSP"));
    expect(net("5V")).not.toBe(net("3V3"));
  });
});

describe("simulation", () => {
  it("blinks an LED wired to a board once a second, and only while running", () => {
    const { board, part, wires, analysis } = autowired("arduino-uno", "led");
    const nodes = [board, part];
    expect(frameAt(nodes, wires, analysis, 0.2, true).nodes[part.id].on).toBe(true);
    expect(frameAt(nodes, wires, analysis, 0.7, true).nodes[part.id].on).toBe(false);
    expect(frameAt(nodes, wires, analysis, 0.2, false).nodes[part.id].on).toBe(false);
    const frame = frameAt(nodes, wires, analysis, 0.2, true);
    const anode = wires.find((w) => w.to.pin === "A")!;
    const gnd = wires.find((w) => w.to.pin === "C")!;
    expect(frame.wires[anode.id]).toMatchObject({ flow: "signal", level: 1 });
    expect(frame.wires[gnd.id]).toMatchObject({ flow: "ground", level: 1 });
  });

  it("reads sensors, shows readings on displays and prints them on serial", () => {
    const esp = node("esp32", 0, 0, "ESP32");
    const dht = node("dht22", 500, 0, "DHT22");
    const oled = node("oled-ssd1306", 500, 300, "OLED");
    const plan1 = planAutoWire(dht, [esp, dht, oled], []).wires.map((w) => ({ id: `w${++seq}`, ...w }));
    const plan2 = planAutoWire(oled, [esp, dht, oled], plan1).wires.map((w) => ({ id: `w${++seq}`, ...w }));
    const wires = [...plan1, ...plan2];
    const analysis = analyze([esp, dht, oled], wires);
    const frame = frameAt([esp, dht, oled], wires, analysis, 3, true);
    expect(frame.nodes[dht.id].readings[0].label).toBe("Temperature");
    // The display shows the sensor's readings as the sketch formats them, one per line.
    expect(frame.nodes[oled.id].text?.[0]).toMatch(/^Temp: \d+\.\d °C$/);
    expect(frame.nodes[oled.id].text?.[1]).toMatch(/^Hum: \d+ %$/);
    expect(serialLine([esp, dht, oled], frame)).toMatch(/^\[3\.0s\] DHT22: .* °C/);
  });

  it("keeps a part dark when it has no ground", () => {
    const uno = node("arduino-uno");
    const buzzer = node("buzzer");
    const wires = [wire(uno, "D8", buzzer, "P")];
    const analysis = analyze([uno, buzzer], wires);
    expect(frameAt([uno, buzzer], wires, analysis, 0.05, true).nodes[buzzer.id].on).toBe(false);
  });
});

describe("activity log", () => {
  it("records parts becoming ready, board links, and faults found then fixed", () => {
    const uno = node("arduino-uno", 0, 0, "Uno");
    const led = node("led", 500, 0, "LED");
    const pi = node("raspberry-pi-4", 0, 400, "Pi");
    const half = [wire(uno, "D13", led, "A")];
    const a1 = analyze([uno, led, pi], half);
    const full = [...half, wire(uno, "GND3", led, "C")];
    const a2 = analyze([uno, led, pi], full);
    const texts = describeChanges(a1, a2, [uno, led, pi]).map((d) => d.text);
    expect(texts).toContain("LED is wired and powered on Uno D13 SCK");
    expect(texts.some((t) => t.startsWith("Fixed on LED: No path to ground"))).toBe(true);

    const linked = [...full, wire(uno, "D2", pi, "GPIO17"), wire(uno, "GND1", pi, "GND1")];
    const a3 = analyze([uno, led, pi], linked);
    expect(describeChanges(a2, a3, [uno, led, pi]).map((d) => d.text)).toContain("Uno connected to Pi over a GPIO line");
  });

  it("writes up a run: first moments, then a summary", () => {
    const { board, part, wires, analysis } = autowired("arduino-uno", "led");
    const rec = new RunRecorder([board, part]);
    rec.start(0);
    const first: string[] = [];
    for (let i = 0; i <= 30; i++) first.push(...rec.frame(frameAt([board, part], wires, analysis, i / 10, true), analysis).map((d) => d.text));
    expect(first).toEqual(["Part flashes on (Board D13 SCK)"]);
    const { draft, ms } = rec.stop();
    expect(draft.text).toMatch(/^Run stopped after 3\.0 s: Part flashed [34] times$/);
    expect(ms).toBe(3000);
  });
});

describe("suggestions", () => {
  it("starts an empty build with a board", () => {
    expect(getPinout(suggest("", []).items[0].part.id).controller).toBe(true);
  });

  it("puts the project's own hardware list first, then what the brief mentions, one part per need", () => {
    const project = { name: "Greenhouse", description: "Watch soil moisture and temperature", hardware: ["soil sensor"], category: "iot" };
    const esp = node("esp32");
    const items = suggest("", [esp], project).items.map((i) => i.part.id);
    expect(items[0]).toBe("soil-moisture");
    expect(items).toContain("dht22");
    expect(items).not.toContain("dht11");
  });

  it("corrects typos and says how a part fits the board", () => {
    const { items, didYouMean } = suggest("temprature", []);
    expect(didYouMean).toBe(true);
    expect(items.map((i) => i.part.id)).toContain("dht11");
    const esp = node("esp32");
    expect(fitFor("hc-sr04", [esp])).toMatchObject({ tone: "warn", text: expect.stringContaining("divider") });
    expect(fitFor("dht22", [esp])).toMatchObject({ tone: "ok" });
    expect(fitFor("led", [])).toMatchObject({ tone: "warn", text: "Add a board to drive it" });
  });
});

describe("terminal", () => {
  const api = (overrides: Partial<TerminalApi> = {}): TerminalApi => {
    const session = { id: "s", name: "Test", projectId: null, createdAt: "", updatedAt: "", nodes: [] as LabNode[], wires: [] as LabWire[], log: [], view: "top" as const, runMs: 0 };
    const analysis = analyze([], []);
    return {
      session,
      analysis,
      frame: frameAt([], [], analysis, 0, false),
      running: false,
      addPart: vi.fn((partId: string) => node(partId)),
      removeNodes: vi.fn(),
      addWire: vi.fn(() => null),
      autowire: vi.fn(() => 0),
      unwire: vi.fn(() => 0),
      run: vi.fn(),
      stop: vi.fn(),
      step: vi.fn(),
      reset: vi.fn(),
      setView: vi.fn(),
      clear: vi.fn(),
      ...overrides,
    };
  };

  it("keeps quoted words together", () => {
    expect(tokenize('wire "Arduino Uno".D13 led.A')).toEqual(["wire", "Arduino Uno.D13", "led.A"]);
  });

  it("adds parts by name or by what they do, and runs", () => {
    const t = api();
    expect(runCommand("add temperature", t)[0]).toMatchObject({ kind: "ok" });
    expect(t.addPart).toHaveBeenCalledWith(expect.stringMatching(/dht|ds18|bmp|am2302/), true);
    runCommand("add led --no-wire", t);
    expect(t.addPart).toHaveBeenLastCalledWith("led", false);
    runCommand("run", t);
    expect(t.run).toHaveBeenCalled();
    runCommand("view flow", t);
    expect(t.setView).toHaveBeenCalledWith("flow");
  });

  it("explains mistakes", () => {
    const uno = node("arduino-uno", 0, 0, "Arduino Uno");
    const t = api();
    t.session.nodes = [uno];
    expect(runCommand("wire uno.D99 uno.D2", t)[0].text).toMatch(/has no pin “D99”/);
    expect(runCommand("wire nothing.A uno.D2", t)[0].text).toMatch(/No part called/);
    expect(runCommand("frobnicate", t)[0]).toMatchObject({ kind: "err", text: expect.stringContaining("help") });
  });
});

describe("lab store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    setLabOwner("acct-1");
    useLab.setState({ hydrated: false, sessions: [], activeId: null, past: [], future: [] });
    useLab.getState().hydrate();
  });
  afterEach(() => {
    vi.useRealTimers();
    setLabOwner(null);
  });

  it("creates sessions, edits with undo and redo, and saves them for the signed-in account", () => {
    const s = useLab.getState().createSession({ name: "Bench" });
    const uno = useLab.getState().addNode("arduino-uno")!;
    const led = useLab.getState().addNode("led")!;
    expect(useLab.getState().addWire({ node: uno.id, pin: "D13" }, { node: led.id, pin: "A" })).not.toBeNull();
    // The same wire twice, either way round, is ignored.
    expect(useLab.getState().addWire({ node: led.id, pin: "A" }, { node: uno.id, pin: "D13" })).toBeNull();
    useLab.getState().undo();
    expect(useLab.getState().sessions[0].wires).toHaveLength(0);
    useLab.getState().redo();
    expect(useLab.getState().sessions[0].wires).toHaveLength(1);
    useLab.getState().removeNodes([led.id]);
    expect(useLab.getState().sessions[0].wires).toHaveLength(0);

    vi.advanceTimersByTime(300);
    const saved = readLabData();
    expect(saved.activeId).toBe(s.id);
    expect(saved.sessions[0].nodes.map((n) => n.partId)).toEqual(["arduino-uno"]);
    expect(saved.sessions[0].log.map((e) => e.text)).toEqual(["Session “Bench” started", "Added Arduino Uno", "Added LED", "Wired Arduino Uno D13 SCK → LED Anode (+)", "Removed LED"]);
    expect(window.localStorage.getItem(labKeyFor("acct-1"))).toContain("Bench");
    // Never under the old key every visitor shared.
    expect(window.localStorage.getItem(LAB_STORAGE_KEY)).toBeNull();
  });

  it("keeps each account's sessions apart, and shows none when signed out", () => {
    useLab.getState().createSession({ name: "Amina's rover" });
    flushLab();
    setLabOwner("acct-2");
    expect(useLab.getState().sessions).toEqual([]);
    useLab.getState().createSession({ name: "Brian's alarm" });
    setLabOwner(null);
    expect(useLab.getState().sessions).toEqual([]);
    setLabOwner("acct-1");
    expect(useLab.getState().sessions.map((s) => s.name)).toEqual(["Amina's rover"]);
    setLabOwner("acct-2");
    expect(useLab.getState().sessions.map((s) => s.name)).toEqual(["Brian's alarm"]);
  });

  it("survives a reload: a fresh store reads the account's sessions back", () => {
    useLab.getState().createSession({ name: "Bench" });
    flushLab();
    useLab.setState({ hydrated: false, sessions: [], activeId: null });
    useLab.getState().hydrate();
    expect(useLab.getState().sessions.map((s) => s.name)).toEqual(["Bench"]);
  });

  it("clears the old shared key", () => {
    window.localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify({ version: 1, sessions: [], activeId: null }));
    readLabData();
    expect(window.localStorage.getItem(LAB_STORAGE_KEY)).toBeNull();
  });

  it("names repeats LED, LED 2 and keeps short names", () => {
    const nodes = [node("led", 0, 0, "LED")];
    expect(nextLabel(nodes, "led")).toBe("LED 2");
    expect(nextLabel([], "hc-sr04")).toBe("HC-SR04");
    expect(nextLabel([], "raspberry-pi-pico")).toBe("Pico");
  });

  it("links, duplicates and deletes sessions", () => {
    const s = useLab.getState().createSession({ name: "A" });
    useLab.getState().addNode("esp32");
    useLab.getState().linkProject(s.id, "local-project-1", "Rover");
    expect(useLab.getState().sessions[0].projectId).toBe("local-project-1");
    const copy = useLab.getState().duplicateSession(s.id)!;
    expect(copy.name).toBe("A (copy)");
    expect(copy.nodes).toHaveLength(1);
    expect(useLab.getState().activeId).toBe(copy.id);
    useLab.getState().deleteSession(copy.id);
    expect(useLab.getState().activeId).toBe(s.id);
    flushLab();
    expect(readLabData().sessions).toHaveLength(1);
  });
});

it("uses the catalogue's part names for every part it can add", () => {
  for (const part of PARTS) expect(getPart(part.id)?.name).toBeTruthy();
});
