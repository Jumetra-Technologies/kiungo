import { describe, expect, it } from "vitest";
import { CircuitSchema, ProjectManifestSchema } from "./project";

describe("ProjectManifestSchema", () => {
  const manifest = { formatVersion: 1, name: "Rover", board: "uno" };

  it("defaults the build profile to simulation", () => {
    expect(ProjectManifestSchema.parse(manifest).profile).toBe("simulation");
  });

  it("keeps unknown fields so files from a newer app survive a round trip", () => {
    const parsed = ProjectManifestSchema.parse({ ...manifest, futureField: { a: 1 } });
    expect(parsed).toMatchObject({ futureField: { a: 1 } });
  });

  it("rejects a format version this app does not understand", () => {
    expect(ProjectManifestSchema.safeParse({ ...manifest, formatVersion: 2 }).success).toBe(false);
  });

  it("rejects an empty project name", () => {
    expect(ProjectManifestSchema.safeParse({ ...manifest, name: "" }).success).toBe(false);
  });

  it("rejects an invalid profile", () => {
    expect(ProjectManifestSchema.safeParse({ ...manifest, profile: "debug" }).success).toBe(false);
  });
});

describe("CircuitSchema", () => {
  it("applies RUN-01 and RUN-02 defaults: virtual parts on emulated boards", () => {
    const circuit = CircuitSchema.parse({
      boards: [{ id: "b1", definition: "uno" }],
      parts: [{ id: "p1", definition: "hcsr04" }],
      wires: [{ from: "b1.D2", to: "p1.TRIG" }],
    });
    expect(circuit.boards[0]?.target).toBe("emulated");
    expect(circuit.parts[0]?.binding).toBe("virtual");
  });

  it("rejects a part with an unknown binding", () => {
    const result = CircuitSchema.safeParse({
      boards: [],
      parts: [{ id: "p1", definition: "x", binding: "cloud" }],
      wires: [],
    });
    expect(result.success).toBe(false);
  });

  it("requires the wires list", () => {
    expect(CircuitSchema.safeParse({ boards: [], parts: [] }).success).toBe(false);
  });
});
