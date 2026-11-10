// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyze } from "../lab/circuit";
import {
  arduinoPinName,
  buildStarter,
  PROJECT_BOARDS,
  sketchProfile,
  StarterError,
  STARTERS,
} from "./";

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
        const boardId = session.nodes[0]!.id;
        const wired = new Set(
          session.wires
            .flatMap((w) => [w.from, w.to])
            .filter((r) => r.node === boardId)
            .map((r) => arduinoPinName(r.pin)),
        );
        for (const [, pin] of code.matchAll(/_PIN = ([A-Z]?\d+);/g))
          expect(wired.has(pin!), `${pin} in ${starter.id}`).toBe(true);
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
    expect(sketchProfile(PROJECT_BOARDS[2]!)).toContain(
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
