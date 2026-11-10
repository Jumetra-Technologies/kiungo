import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { analyze } from "@kiungo/core/lab/circuit";
import { parseSessionFile, sessionFileName, SessionFileError, SESSION_FILE_FORMAT, toSessionFile } from "@kiungo/core/lab/session-file";
import { newSession, useLab } from "@kiungo/lab/store";
import type { LabSession } from "@kiungo/core/lab/types";

const rover = readFileSync(join(__dirname, "fixtures", "sentinel-rover.kiungo.json"), "utf8");

function blinky(): LabSession {
  return {
    ...newSession({ name: "Blinky" }),
    nodes: [
      { id: "u", partId: "arduino-uno", label: "Uno", x: 0, y: 0, mode: "virtual" },
      { id: "l", partId: "led", label: "LED", x: 320, y: 40, mode: "virtual" },
    ],
    wires: [
      { id: "w1", from: { node: "u", pin: "D13" }, to: { node: "l", pin: "A" } },
      { id: "w2", from: { node: "u", pin: "GND3" }, to: { node: "l", pin: "C" } },
    ],
    inputs: { u: { delayMs: 250 } },
  };
}

describe("kiungo session files", () => {
  it("round-trips a session through the file format", () => {
    const original = blinky();
    const file = toSessionFile({ ...original, runtime: { workspaceId: "WS1", nodeIds: {}, wireIds: {} } }, "test");
    expect(file.format).toBe(SESSION_FILE_FORMAT);
    expect(file.session.runtime).toBeNull();
    const { session, warnings } = parseSessionFile(JSON.stringify(file));
    expect(warnings).toEqual([]);
    expect(session.id).not.toBe(original.id);
    expect(session.name).toBe("Blinky");
    expect(session.nodes).toEqual(original.nodes);
    expect(session.wires).toEqual(original.wires);
    expect(session.inputs).toEqual({ u: { delayMs: 250 } });
  });

  it("opens the build an AI made through the MCP server, with no circuit errors", () => {
    const { session, warnings } = parseSessionFile(rover);
    expect(warnings).toEqual([]);
    expect(session.name).toBe("Sentinel Rover");
    expect(session.nodes).toHaveLength(11);
    expect(session.wires).toHaveLength(38);
    const errors = analyze(session.nodes, session.wires).faults.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
  });

  it("drops parts the lab doesn't have and wires to missing pins, with warnings", () => {
    const s = blinky();
    const file = toSessionFile({
      ...s,
      nodes: [...s.nodes, { id: "x", partId: "flux-capacitor", label: "Flux", x: 0, y: 0, mode: "virtual" }],
      wires: [...s.wires, { id: "w3", from: { node: "u", pin: "D99" }, to: { node: "l", pin: "A" } }, { id: "w4", from: { node: "u", pin: "D2" }, to: { node: "x", pin: "IN" } }, { id: "w5", from: { node: "l", pin: "A" }, to: { node: "u", pin: "D13" } }],
    });
    const { session, warnings } = parseSessionFile(file);
    expect(session.nodes.map((n) => n.id)).toEqual(["u", "l"]);
    expect(session.wires.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(warnings.some((w) => w.includes("flux-capacitor"))).toBe(true);
    expect(warnings.filter((w) => w.startsWith("Skipped a wire"))).toHaveLength(2);
  });

  it("refuses files that aren't lab sessions", () => {
    expect(() => parseSessionFile("not json")).toThrow(SessionFileError);
    expect(() => parseSessionFile({ format: "something-else", version: 1, session: {} })).toThrow(/Unknown file format/);
    expect(() => parseSessionFile({ format: SESSION_FILE_FORMAT, version: 9, session: blinky() })).toThrow(/version 9/);
    expect(() => parseSessionFile({ format: SESSION_FILE_FORMAT, version: 1 })).toThrow(/no lab session/);
  });

  it("names files after the session", () => {
    expect(sessionFileName({ name: "Sentinel Rover" })).toBe("sentinel-rover.kiungo.json");
    expect(sessionFileName({ name: "  !! " })).toBe("lab.kiungo.json");
  });
});

describe("opening a file in the lab store", () => {
  beforeEach(() => useLab.setState({ sessions: [], activeId: null, past: [], future: [], hydrated: true }));

  it("adds the session, makes it active and logs where it came from", () => {
    const { session } = parseSessionFile(rover);
    const opened = useLab.getState().importSession(session, "sentinel-rover.kiungo.json");
    const state = useLab.getState();
    expect(state.activeId).toBe(opened.id);
    expect(state.sessions[0].nodes).toHaveLength(11);
    expect(state.sessions[0].log.at(-1)?.text).toBe("Opened from sentinel-rover.kiungo.json");
  });

  it("never collides with a session already open", () => {
    const { session } = parseSessionFile(rover, { keepId: true });
    const first = useLab.getState().importSession(session);
    const second = useLab.getState().importSession(session);
    expect(second.id).not.toBe(first.id);
    expect(useLab.getState().sessions).toHaveLength(2);
  });
});
