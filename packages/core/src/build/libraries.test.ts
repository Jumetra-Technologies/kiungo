// @vitest-environment node
import { describe, expect, it } from "vitest";
import { libraryForHeader, readSketchProfile } from "./";
import { PROJECT_BOARDS, sketchProfile } from "../project";

describe("libraries (BLD-04, FIX-02)", () => {
  it("reads back the profile Kiungo writes", () => {
    const yaml = sketchProfile(PROJECT_BOARDS[0]!, [
      { name: "DHT sensor library", version: "1.4.7" },
      { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true },
    ]);
    expect(readSketchProfile(yaml)).toEqual({
      fqbn: "arduino:avr:uno",
      platforms: [{ id: "arduino:avr", version: "1.8.6" }],
      libraries: [
        { name: "DHT sensor library", version: "1.4.7", dependency: false },
        { name: "Adafruit Unified Sensor", version: "1.1.15", dependency: true },
      ],
    });
  });

  it("reads the profile Arduino CLI rewrites, and only the one asked for", () => {
    const yaml = [
      "profiles:",
      "  other:",
      "    fqbn: arduino:avr:nano",
      "    libraries:",
      "      - Nope (1.0.0)",
      "  kiungo:",
      "    fqbn: arduino:avr:mega:cpu=atmega2560",
      "    platforms:",
      "      - platform: arduino:avr (1.8.6)",
      "    libraries:",
      "      - LiquidCrystal I2C (1.1.2)  # the display",
      "      - dir: ../my-lib",
      "default_profile: kiungo",
    ].join("\r\n");
    expect(readSketchProfile(yaml)).toEqual({
      fqbn: "arduino:avr:mega:cpu=atmega2560",
      platforms: [{ id: "arduino:avr", version: "1.8.6" }],
      libraries: [{ name: "LiquidCrystal I2C", version: "1.1.2", dependency: false }],
    });
  });

  it("a missing header names its library", () => {
    expect(libraryForHeader("Servo.h")?.name).toBe("Servo");
    expect(libraryForHeader("DHT.h")?.name).toBe("DHT sensor library");
    expect(libraryForHeader("LiquidCrystal_I2C.h")?.name).toBe("LiquidCrystal I2C");
    expect(libraryForHeader("nope.h")).toBeNull();
  });
});
