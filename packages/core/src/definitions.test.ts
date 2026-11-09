import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BoardDefinitionSchema } from "./board";
import { PartDefinitionSchema } from "./part";

/** Every shipped definition must satisfy the schema the app will load it with (HWT-11, PRJ-04). */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function definitionsIn(directory: string): { file: string; data: unknown }[] {
  const folder = join(repoRoot, directory);
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ file: name, data: JSON.parse(readFileSync(join(folder, name), "utf8")) }));
}

describe("boards/*.json", () => {
  const boards = definitionsIn("boards");

  it("ships at least one board", () => {
    expect(boards.length).toBeGreaterThan(0);
  });

  it.each(boards.map((b) => [b.file, b] as const))(
    "%s is valid and named after its id",
    (_name, board) => {
      const result = BoardDefinitionSchema.safeParse(board.data);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.data?.id).toBe(basename(board.file, ".json"));
    },
  );

  it.each(boards.map((b) => [b.file, b] as const))(
    "%s has electrically sensible numbers",
    (_name, board) => {
      const parsed = BoardDefinitionSchema.parse(board.data);
      expect(parsed.adcRefVolts).toBeLessThanOrEqual(parsed.logicVolts + 0.001);
      expect(parsed.maxPinMilliamps).toBeLessThanOrEqual(100);
      expect(parsed.pins.some((pin) => pin.functions.includes("adc"))).toBe(true);
    },
  );
});

describe("parts/*.json", () => {
  const parts = definitionsIn("parts");

  it("ships at least one part", () => {
    expect(parts.length).toBeGreaterThan(0);
  });

  it.each(parts.map((p) => [p.file, p] as const))(
    "%s is valid and named after its id",
    (_name, part) => {
      const result = PartDefinitionSchema.safeParse(part.data);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.data?.id).toBe(basename(part.file, ".json"));
    },
  );

  it.each(parts.map((p) => [p.file, p] as const))(
    "%s declares power and ground pins",
    (_name, part) => {
      const parsed = PartDefinitionSchema.parse(part.data);
      const types = parsed.pins.map((pin) => pin.electricalType);
      expect(types).toContain("power");
      expect(types).toContain("ground");
    },
  );
});
