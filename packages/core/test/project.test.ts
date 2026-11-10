// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../src/lab/circuit";
import {
  arduinoPinName,
  buildStarter,
  circuitThumbnail,
  folderNameFor,
  parseCircuit,
  parseHistory,
  parseProjectMeta,
  PROJECT_BOARDS,
  ProjectFileError,
  serializeCircuit,
  serializeProjectMeta,
  sketchProfile,
  StarterError,
  STARTERS,
} from "../src/project";

describe("starters (DSK-11)", () => {
  for (const board of PROJECT_BOARDS) {
    for (const starter of STARTERS.filter((s) => !s.notOn?.[board.part])) {
      it(`${starter.title} on the ${board.name}: wired with no errors, and the code uses the wired pins`, () => {
        const { session, code } = buildStarter({
          name: "Test",
          board: board.part,
          starter: starter.id,
        });
        expect(session.nodes.map((n) => n.partId)).toEqual([board.part, ...starter.parts]);
        const errors = analyze(session.nodes, session.wires, session.inputs).faults.filter(
          (f) => f.severity === "error",
        );
        expect(errors).toEqual([]);
        expect(code).not.toMatch(/\{\{/);
        // Every pin constant in the sketch is a board pin a wire really goes to.
        const boardId = session.nodes[0].id;
        const wired = new Set(
          session.wires
            .flatMap((w) => [w.from, w.to])
            .filter((r) => r.node === boardId)
            .map((r) => arduinoPinName(r.pin)),
        );
        for (const [, pin] of code.matchAll(/_PIN = ([A-Z]?\d+);/g))
          expect(wired.has(pin), `${pin} in ${starter.id}`).toBe(true);
      });
    }
  }

  it("Blink drives the LED on pin 13 of an Uno", () => {
    expect(buildStarter({ name: "Blink", board: "arduino-uno", starter: "blink" }).code).toContain(
      "const int LED_PIN = 13;",
    );
  });

  it("the night light reads the light sensor on an analog pin", () => {
    expect(
      buildStarter({ name: "Night", board: "arduino-uno", starter: "night-light" }).code,
    ).toMatch(/LIGHT_PIN = A\d;/);
  });

  it("a blank project is the board alone and an empty sketch", () => {
    const { session, code, libraries } = buildStarter({
      name: "Blank",
      board: "arduino-uno",
      starter: null,
    });
    expect(session.nodes).toHaveLength(1);
    expect(session.wires).toEqual([]);
    expect(code).toContain("void setup()");
    expect(libraries).toEqual([]);
  });

  it("a starter that isn't safe on a board says why", () => {
    expect(() => buildStarter({ name: "x", board: "esp32", starter: "distance" })).toThrow(
      /level shifter/,
    );
  });

  it("the ESP32's profile names the board package's own index", () => {
    expect(sketchProfile(PROJECT_BOARDS[2])).toContain(
      "      - platform: esp32:esp32 (3.3.12)\n        platform_index_url: https://espressif.github.io/arduino-esp32/package_esp32_index.json\n",
    );
  });

  it("refuses an unknown starter or a part that isn't a board", () => {
    expect(() => buildStarter({ name: "x", board: "arduino-uno", starter: "nope" })).toThrow(
      StarterError,
    );
    expect(() => buildStarter({ name: "x", board: "led", starter: null })).toThrow(StarterError);
  });

  it("starters that need a library pin it", () => {
    expect(STARTERS.find((s) => s.id === "servo")?.libraries).toEqual([
      { name: "Servo", version: "1.3.0" },
    ]);
    expect(STARTERS.find((s) => s.id === "dht11")?.libraries).toEqual([
      { name: "DHT sensor library", version: "1.4.7" },
      { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true },
    ]);
  });
});

describe("the project files (PRJ-01, DSK-12)", () => {
  it("sketch.yaml pins the board package and the libraries, as the default profile", () => {
    const yaml = sketchProfile(PROJECT_BOARDS[0], [{ name: "Servo", version: "1.3.0" }]);
    expect(yaml).toContain("    fqbn: arduino:avr:uno\n");
    expect(yaml).toContain("      - platform: arduino:avr (1.8.6)\n");
    expect(yaml).toContain("    libraries:\n      - Servo (1.3.0)\n");
    expect(yaml).toContain("default_profile: kiungo\n");
    expect(sketchProfile(PROJECT_BOARDS[0])).not.toContain("libraries:");
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

describe("the Home thumbnail (DSK-10)", () => {
  it("draws each part where it sits and each joined pair of parts once", () => {
    const { session } = buildStarter({
      name: "Alarm",
      board: "arduino-uno",
      starter: "motion-alarm",
    });
    const thumb = circuitThumbnail(session.nodes, session.wires);
    expect(thumb.boxes.map((b) => b.kind)).toEqual(["board", "sensor", "output"]);
    expect(thumb.lines).toHaveLength(2);
    for (const b of thumb.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(thumb.width);
      expect(b.y + b.h).toBeLessThanOrEqual(thumb.height);
    }
  });

  it("an empty circuit gives an empty drawing", () => {
    expect(circuitThumbnail([], [])).toEqual({ width: 160, height: 100, boxes: [], lines: [] });
  });
});
