import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LabNode } from "./types";
import { logEntry, makeId, newSession, nextLabel, shortName } from "./session";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const node = (label: string): LabNode => ({
  id: label,
  partId: "led",
  label,
  x: 0,
  y: 0,
  mode: "virtual",
});

describe("lab sessions", () => {
  it("ids carry a prefix, the time and some randomness, and don't repeat", () => {
    const a = makeId("n");
    expect(a).toMatch(new RegExp(`^n-${Date.now().toString(36)}-[0-9a-z-]{8}$`));
    expect(makeId("n")).not.toBe(a);
  });

  it("a new session starts empty, on the top view, with a line in its log", () => {
    const s = newSession({ name: "  Weather  " });
    expect(s).toMatchObject({
      name: "Weather",
      projectId: null,
      nodes: [],
      wires: [],
      view: "top",
      runMs: 0,
      inputs: {},
      runtime: null,
      createdAt: "2026-11-10T12:00:00.000Z",
    });
    expect(s.log.map((e) => [e.kind, e.text])).toEqual([["session", "Session “Weather” started"]]);
    expect(newSession().name).toBe("Untitled lab");
  });

  it("log entries name the parts they're about only when there are some", () => {
    expect(logEntry("fault", "x", ["a"])).toMatchObject({
      kind: "fault",
      text: "x",
      nodes: ["a"],
      at: "2026-11-10T12:00:00.000Z",
    });
    expect(logEntry("note", "y", [])).not.toHaveProperty("nodes");
  });

  it("parts get short names, numbered when there's more than one", () => {
    expect(shortName("led")).toBe("LED");
    expect(shortName("no-such-part")).toBe("no-such-part");
    expect(nextLabel([], "led")).toBe("LED");
    expect(nextLabel([node("LED")], "led")).toBe("LED 2");
    expect(nextLabel([node("LED"), node("LED 2"), node("LED 4")], "led")).toBe("LED 3");
  });
});
