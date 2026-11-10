import { describe, expect, expectTypeOf, it } from "vitest";
import { newSession } from "./session";
import type {
  DeviceMode,
  LabNode,
  LabSession,
  LabView,
  LogKind,
  NodeInputs,
  PinRef,
} from "./types";

describe("lab types", () => {
  it("a new session has every field a saved one has", () => {
    const s: LabSession = newSession({ name: "Test" });
    expect(Object.keys(s).sort()).toEqual(
      [
        "createdAt",
        "id",
        "inputs",
        "log",
        "name",
        "nodes",
        "projectId",
        "runMs",
        "runtime",
        "updatedAt",
        "view",
        "wires",
      ].sort(),
    );
  });

  it("names the views, modes and log kinds the lab uses", () => {
    expectTypeOf<LabView>().toEqualTypeOf<"reality" | "top" | "flow">();
    expectTypeOf<DeviceMode>().toEqualTypeOf<"virtual" | "physical" | "hybrid">();
    expectTypeOf<LogKind>().toEqualTypeOf<
      "session" | "build" | "wire" | "run" | "state" | "fault" | "fix" | "note"
    >();
    expectTypeOf<NodeInputs>().toEqualTypeOf<Record<string, number | string | boolean>>();
    expectTypeOf<PinRef>().toEqualTypeOf<{ node: string; pin: string }>();
    expectTypeOf<LabNode>().toHaveProperty("partId");
  });
});
