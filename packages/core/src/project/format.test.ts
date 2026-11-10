// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildStarter,
  folderNameFor,
  parseCircuit,
  parseHistory,
  parseProjectMeta,
  PROJECT_BOARDS,
  ProjectFileError,
  serializeCircuit,
  serializeProjectMeta,
  sketchProfile,
} from "./";

describe("the project files (PRJ-01, DSK-12)", () => {
  it("sketch.yaml pins the board package and the libraries, as the default profile", () => {
    const yaml = sketchProfile(PROJECT_BOARDS[0]!, [{ name: "Servo", version: "1.3.0" }]);
    expect(yaml).toContain("    fqbn: arduino:avr:uno\n");
    expect(yaml).toContain("      - platform: arduino:avr (1.8.6)\n");
    expect(yaml).toContain("    libraries:\n      - Servo (1.3.0)\n");
    expect(yaml).toContain("default_profile: kiungo\n");
    expect(sketchProfile(PROJECT_BOARDS[0]!)).not.toContain("libraries:");
  });

  it("kiungo.json round-trips and refuses what isn't a project", () => {
    const meta = {
      format: "kiungo-project" as const,
      version: 1 as const,
      id: "prj-1",
      name: "Rover",
      board: "arduino-uno",
      starter: "blink",
      createdAt: "2026-11-02T07:00:00.000Z",
      updatedAt: "2026-11-02T07:00:00.000Z",
    };
    expect(parseProjectMeta(serializeProjectMeta(meta))).toEqual(meta);
    expect(() => parseProjectMeta("{")).toThrow(ProjectFileError);
    expect(() => parseProjectMeta(JSON.stringify({ format: "something-else" }))).toThrow(
      ProjectFileError,
    );
    expect(() => parseProjectMeta(JSON.stringify({ ...meta, version: 9 }))).toThrow(/newer Kiungo/);
  });

  it("circuit.json is the lab session file and keeps ids, so undo history still matches", () => {
    const { session } = buildStarter({ name: "Radar", board: "arduino-uno", starter: "distance" });
    const back = parseCircuit(serializeCircuit(session, "Kiungo test")).session;
    expect(back.id).toBe(session.id);
    expect(back.nodes).toEqual(session.nodes);
    expect(back.wires.map((w) => w.id)).toEqual(session.wires.map((w) => w.id));
    expect(() => parseCircuit("not json")).toThrow(ProjectFileError);
  });

  it("an unreadable history is ignored, not an error", () => {
    expect(parseHistory("garbage")).toBeNull();
    expect(
      parseHistory(JSON.stringify({ version: 1, past: [{ nodes: [], wires: [] }, 5], future: [] })),
    ).toEqual({ version: 1, past: [{ nodes: [], wires: [] }], future: [] });
  });

  it("folder names are safe on every system", () => {
    expect(folderNameFor("My robot")).toBe("My robot");
    expect(folderNameFor('Arm: v2 / "final"?')).toBe("Arm v2 final");
    expect(folderNameFor("CON")).toBe("Kiungo project");
    expect(folderNameFor("dots...")).toBe("dots");
    expect(folderNameFor("   ")).toBe("Kiungo project");
  });
});
