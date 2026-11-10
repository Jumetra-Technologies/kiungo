import { describe, expect, it } from "vitest";
import { newSession } from "../lab/session";
import type { LabNode } from "../lab/types";
import { boardForSession, phaseOneProjectNotes } from "./import";

const node = (id: string, partId: string): LabNode => ({
  id,
  partId,
  label: partId === "raspberry-pi-4" ? "Pi" : partId,
  x: 0,
  y: 0,
  mode: "virtual",
});

describe("Phase One work into desktop projects", () => {
  it("a session's first board the desktop builds for is the project's board", () => {
    expect(boardForSession(newSession({ nodes: [node("a", "led"), node("b", "esp32")] }))).toEqual({
      board: "esp32",
      warning: null,
    });
    expect(boardForSession(newSession({ nodes: [node("a", "led")] }))).toEqual({
      board: "arduino-uno",
      warning: null,
    });
  });

  it("a board it can't build for yet falls back to the Uno, and says so", () => {
    const { board, warning } = boardForSession(
      newSession({ nodes: [node("p", "raspberry-pi-4")] }),
    );
    expect(board).toBe("arduino-uno");
    expect(warning).toMatch(/can't build code for Pi yet/);
  });

  it("a website project becomes notes in Markdown", () => {
    const notes = phaseOneProjectNotes({
      id: "1",
      name: " Weather station ",
      description: "Logs the weather.",
      objectives: "Learn I²C.",
      hardware: [
        "DHT22",
        { name: "Uno", quantity: 2 },
        { name: "Cable", quantity: 1 },
        { quantity: 3 },
      ],
      teammates: ["Ann", { name: "Ben", role: "Wiring" }, {}],
      contributors: "Class 4B",
      updated_at: "2026-03-04T10:00:00Z",
    });
    expect(notes).toBe(
      [
        "# Weather station",
        "",
        "Logs the weather.",
        "",
        "## Objectives",
        "",
        "Learn I²C.",
        "",
        "## Hardware",
        "",
        "- DHT22",
        "- 2 × Uno",
        "- Cable",
        "- 3 × ",
        "",
        "## Team",
        "",
        "- Ann",
        "- Ben, Wiring",
        "",
        "## Contributors",
        "",
        "Class 4B",
        "",
        "Imported from the Kiungo website, last changed 2026-03-04.",
        "",
      ].join("\n"),
    );
    expect(phaseOneProjectNotes({ id: "2", name: "" })).toBe(
      "# Untitled project\n\nImported from the Kiungo website.\n",
    );
  });
});
