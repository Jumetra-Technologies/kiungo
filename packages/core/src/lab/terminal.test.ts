import { describe, expect, it, vi } from "vitest";
import { analyze } from "./circuit";
import { frameAt } from "./simulate";
import { runCommand, tokenize, type TerminalApi } from "./terminal";
import type { LabNode, LabWire } from "./types";

let seq = 0;

const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({
  id: `n${++seq}`,
  partId,
  label: label ?? partId,
  x,
  y,
  mode: "virtual",
});

describe("terminal", () => {
  const api = (overrides: Partial<TerminalApi> = {}): TerminalApi => {
    const session = {
      id: "s",
      name: "Test",
      projectId: null,
      createdAt: "",
      updatedAt: "",
      nodes: [] as LabNode[],
      wires: [] as LabWire[],
      log: [],
      view: "top" as const,
      runMs: 0,
    };
    const analysis = analyze([], []);
    return {
      session,
      analysis,
      frame: frameAt({ nodes: [], wires: [], analysis, t: 0, running: false }),
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
    expect(runCommand("wire uno.D99 uno.D2", t)[0]!.text).toMatch(/has no pin “D99”/);
    expect(runCommand("wire nothing.A uno.D2", t)[0]!.text).toMatch(/No part called/);
    expect(runCommand("frobnicate", t)[0]).toMatchObject({
      kind: "err",
      text: expect.stringContaining("help"),
    });
  });
});

describe("every terminal command", () => {
  /** A lab with an Uno and an LED wired to pin 13, and every action recorded. */
  function lab(running = false) {
    const uno: LabNode = {
      id: "uno",
      partId: "arduino-uno",
      label: "Arduino Uno",
      x: 0,
      y: 0,
      mode: "virtual",
    };
    const led: LabNode = { id: "led", partId: "led", label: "LED", x: 300, y: 0, mode: "virtual" };
    const wires: LabWire[] = [
      { id: "w1", from: { node: "uno", pin: "D13" }, to: { node: "led", pin: "A" } },
      { id: "w2", from: { node: "uno", pin: "GND1" }, to: { node: "led", pin: "C" } },
    ];
    const nodes = [uno, led];
    const analysis = analyze(nodes, wires);
    const api: TerminalApi = {
      session: {
        id: "s",
        name: "Bench",
        projectId: null,
        createdAt: "",
        updatedAt: "",
        nodes,
        wires,
        log: [
          { id: "l1", at: "2026-11-10T12:00:00Z", kind: "fault", text: "LED shorted" },
          { id: "l2", at: "2026-11-10T12:00:01Z", kind: "note", text: "Fixed" },
        ],
        view: "top",
        runMs: 0,
        inputs: {},
        runtime: null,
      },
      analysis,
      frame: frameAt({ nodes, wires, analysis, t: 2.5, running }),
      running,
      addPart: vi.fn((partId: string) =>
        partId === "breadboard" ? null : { ...led, id: "new", partId, label: `New ${partId}` },
      ),
      removeNodes: vi.fn(),
      addWire: vi.fn((a) => (a.pin === "D2" ? { id: "w9", from: a, to: a } : null)),
      autowire: vi.fn((id: string) => (id === "led" ? 2 : id === "uno" ? 0 : 1)),
      unwire: vi.fn(() => 1),
      run: vi.fn(),
      stop: vi.fn(),
      step: vi.fn(),
      reset: vi.fn(),
      setView: vi.fn(),
      clear: vi.fn(),
    };
    return api;
  }
  const say = (input: string, api = lab()) => runCommand(input, api);
  const text = (input: string, api = lab()) => say(input, api).map((l) => `${l.kind}: ${l.text}`);

  it("help lists the commands, as does ?", () => {
    expect(say("help").length).toBe(13);
    expect(say("?")).toEqual(say("help"));
    expect(say("   ")).toEqual([]);
  });

  it("add finds parts by id or search, wires them unless told not to, and says when it can't", () => {
    const api = lab();
    expect(text("add dht22", api)).toEqual(["ok: Added New dht22 and wired it to the board"]);
    expect(api.addPart).toHaveBeenLastCalledWith("dht22", true);
    expect(text("add temperature --no-wire", api)[0]).toMatch(/^ok: Added New /);
    expect(api.addPart).toHaveBeenLastCalledWith(expect.any(String), false);
    expect(text("add arduino-mega")).toEqual(["ok: Added New arduino-mega"]); // a board isn't wired
    expect(text("add breadboard")).toEqual(["err: Couldn't add the part"]);
    expect(text("add")).toEqual(["err: Usage: add <part>, for example add dht22"]);
    expect(text("add flux capacitor")).toEqual(["err: No part matches “flux capacitor”"]);
  });

  it("rm, remove and delete take a part out", () => {
    for (const verb of ["rm", "remove", "delete"]) {
      const api = lab();
      expect(text(`${verb} led`, api)).toEqual(["ok: Removed LED"]);
      expect(api.removeNodes).toHaveBeenCalledWith(["led"]);
    }
    expect(text("rm ghost")).toEqual(["err: No part called “ghost”"]);
  });

  it("wire joins two pins by part and pin name", () => {
    expect(text("wire uno.D2 led.A")).toEqual(["ok: Wired uno.D2 → led.A"]);
    expect(text("wire uno.D13 led.A")).toEqual(["err: Those pins are already wired"]);
    expect(text("wire uno.D13")).toEqual(["err: Usage: wire <part>.<pin> <part>.<pin>"]);
    expect(text("wire uno led.A")[0]).toMatch(/^err: Use part.pin/);
    expect(text("wire ghost.A led.A")).toEqual(["err: No part called “ghost” on the canvas"]);
    expect(text("wire uno.D99 led.A")[0]).toMatch(
      /^err: Arduino Uno has no pin “D99”. Try: pins arduino/,
    );
    expect(text('wire "Arduino Uno".D2 led.A')).toEqual(["ok: Wired Arduino Uno.D2 → led.A"]);
  });

  it("autowire and unwire, with what happened", () => {
    expect(text("autowire led")).toEqual(["ok: Wired LED with 2 wires"]);
    expect(text("autowire uno")).toEqual(["err: Boards don't auto-wire; wire parts to them"]);
    expect(text("autowire ghost")).toEqual(["err: No part called “ghost”"]);
    expect(text("unwire led")).toEqual(["ok: Removed 1 wire from LED"]);
    expect(text("unwire ghost")).toEqual(["err: No part called “ghost”"]);
  });

  it("ls lists parts and their status; an empty canvas says how to start", () => {
    const lines = text("ls");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^out: Arduino Uno\s+ready/);
    expect(text("parts")).toEqual(lines);
    const empty = lab();
    empty.session = { ...empty.session, nodes: [] };
    expect(text("ls", empty)).toEqual(["muted: Nothing on the canvas yet. Try: add uno"]);
  });

  it("pins shows what each pin connects to", () => {
    const lines = say("pins led");
    expect(lines.map((l) => l.kind)).toEqual(["out", "out"]);
    expect(lines[0]!.text).toMatch(/Arduino Uno\.D13$/);
    const uno = say("pins uno");
    expect(uno.some((l) => l.kind === "muted" && l.text.endsWith("—"))).toBe(true);
    expect(text("pins ghost")).toEqual(["err: No part called “ghost”"]);
  });

  it("read shows a part's live readings, or why there are none", () => {
    expect(text("read led", lab(true))[0]).toMatch(/^out: State\s+O(n|ff)$/);
    const stopped = lab();
    stopped.frame = { ...stopped.frame, nodes: {} };
    expect(text("read led", stopped)).toEqual(["muted: Not running. Type run first."]);
    const dead = lab(true);
    dead.frame = { ...dead.frame, nodes: {} };
    expect(text("read led", dead)).toEqual(["muted: LED has nothing to report"]);
    expect(text("read ghost")).toEqual(["err: No part called “ghost”"]);
  });

  it("faults lists problems by severity, or says there are none", () => {
    const lines = say("faults");
    expect(lines.map((l) => l.kind)).toEqual(lines.map(() => "muted")); // the LED's resistor tip
    expect(lines[0]!.text).toMatch(/^TIP\s+Assumed: 220 Ω resistor/);
    const broken = lab();
    broken.analysis = analyze(broken.session.nodes, [broken.session.wires[0]!]);
    expect(say("problems", broken).some((l) => l.kind === "err")).toBe(true);
    const clean = lab();
    clean.analysis = { ...clean.analysis, faults: [] };
    expect(text("faults", clean)).toEqual(["ok: No problems found"]);
  });

  it("status sums the session up", () => {
    expect(text("status")).toEqual(["out: Bench: 2 parts, 2 wires, stopped", "muted: 2 ready"]);
    expect(text("status", lab(true))[0]).toBe("out: Bench: 2 parts, 2 wires, running (2.5 s)");
    const empty = lab();
    empty.analysis = { ...empty.analysis, nodes: {} };
    expect(text("status", empty)[1]).toBe("muted: empty");
  });

  it("run, stop, step, reset and clear do what they say", () => {
    const api = lab();
    expect(text("run", api)).toEqual([
      "ok: Running the default sketch: blink outputs, read sensors",
    ]);
    expect(text("start", api)).toEqual([
      "ok: Running the default sketch: blink outputs, read sensors",
    ]);
    expect(text("stop", api)).toEqual(["ok: Stopped"]);
    expect(text("pause", api)).toEqual(["ok: Stopped"]);
    expect(text("step", api)).toEqual(["ok: Stepped 100 ms"]);
    expect(text("reset", api)).toEqual(["ok: Reset to 0 s"]);
    expect(text("clear", api)).toEqual([]);
    expect(text("cls", api)).toEqual([]);
    expect(api.run).toHaveBeenCalledTimes(2);
    expect(api.stop).toHaveBeenCalledTimes(2);
    expect(api.clear).toHaveBeenCalledTimes(2);
  });

  it("view switches by any of its names", () => {
    const api = lab();
    for (const [name, view] of [
      ["3d", "reality"],
      ["model", "reality"],
      ["top", "top"],
      ["plan", "top"],
      ["flow", "flow"],
      ["current", "flow"],
    ] as const) {
      expect(text(`view ${name}`, api)).toEqual([`ok: View: ${name}`]);
      expect(api.setView).toHaveBeenLastCalledWith(view);
    }
    expect(text("view sideways")).toEqual(["err: Usage: view 3d | top | flow"]);
    expect(text("view")).toEqual(["err: Usage: view 3d | top | flow"]);
  });

  it("log shows the last entries, faults as errors", () => {
    const lines = say("log");
    expect(lines.map((l) => l.kind)).toEqual(["err", "out"]);
    expect(lines[0]!.text).toMatch(/LED shorted$/);
    expect(say("log 1")).toHaveLength(1);
    expect(say("log nope")).toHaveLength(2);
  });

  it("anything else is unknown, and says so", () => {
    expect(text("frobnicate")).toEqual([
      "err: Unknown command “frobnicate”. Type help for the list.",
    ]);
    expect(text("constructor")).toEqual([
      "err: Unknown command “constructor”. Type help for the list.",
    ]);
  });
});
