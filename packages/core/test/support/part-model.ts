/**
 * What every part model must hold, for the per-part tests next to each model.
 * The same checks the website's component library has always run over the catalog.
 */
import { expect } from "vitest";
import { getPart } from "../../src/parts";
import type { PartModel, Solid } from "../../src/parts/types";
import { getPinout, hasPinout } from "../../src/lab/pinout";

function footprintOf(solid: Solid): { x1: number; y1: number; x2: number; y2: number } | null {
  switch (solid.kind) {
    case "box":
      return { x1: solid.x, y1: solid.y, x2: solid.x + solid.w, y2: solid.y + solid.h };
    case "cyl":
    case "dome":
      return {
        x1: solid.cx - solid.r,
        y1: solid.cy - solid.r,
        x2: solid.cx + solid.r,
        y2: solid.cy + solid.r,
      };
    default:
      return null;
  }
}

function expectWithinFootprint(part: PartModel) {
  // Solids stay close to the stated footprint (connectors may overhang a little).
  const slack = Math.max(part.size.w, part.size.h) * 0.35;
  for (const solid of part.solids) {
    const box = footprintOf(solid);
    if (!box) continue;
    expect(box.x1).toBeGreaterThanOrEqual(-slack);
    expect(box.y1).toBeGreaterThanOrEqual(-slack);
    expect(box.x2).toBeLessThanOrEqual(part.size.w + slack);
    expect(box.y2).toBeLessThanOrEqual(part.size.h + slack);
    if (solid.kind === "box" || solid.kind === "cyl" || solid.kind === "dome")
      expect((solid.z ?? 0) + solid.d).toBeLessThanOrEqual(part.size.d + 0.01);
  }
}

function expectCircuitGraph(part: PartModel) {
  // The circuit is a graph whose links all resolve, laid out on a small grid.
  const blockIds = part.circuit.blocks.map((block) => block.id);
  expect(new Set(blockIds).size).toBe(blockIds.length);
  expect(part.circuit.blocks.length).toBeGreaterThanOrEqual(4);
  expect(part.circuit.links.length).toBeGreaterThanOrEqual(3);
  const cells = new Set<string>();
  for (const block of part.circuit.blocks) {
    expect(block.col).toBeLessThanOrEqual(4);
    expect(block.row).toBeLessThanOrEqual(3);
    expect(block.label.length).toBeLessThanOrEqual(18);
    expect(cells.has(`${block.col},${block.row}`), `${block.id} overlaps another block`).toBe(
      false,
    );
    cells.add(`${block.col},${block.row}`);
  }
  for (const link of part.circuit.links) {
    expect(blockIds, `${part.id}: link from ${link.from}`).toContain(link.from);
    expect(blockIds, `${part.id}: link to ${link.to}`).toContain(link.to);
  }
  expect(part.circuit.steps.length).toBeGreaterThanOrEqual(3);
}

/** Complete, internally consistent, and wired the way the lab wires it. */
export function expectWellMadePart(part: PartModel) {
  expect(getPart(part.id), "in the catalog under its own id").toBe(part);
  expect(part.summary.length).toBeGreaterThan(40);
  expect(part.solids.length).toBeGreaterThanOrEqual(3);
  expect(part.features.length).toBeGreaterThanOrEqual(2);
  expect(part.pins.length).toBeGreaterThanOrEqual(2);
  expect(part.facts.length).toBeGreaterThanOrEqual(5);
  expect(part.tags.length).toBeGreaterThanOrEqual(3);
  expect(part.experiment.title).toBeTruthy();
  expect(part.experiment.idea.length).toBeGreaterThan(30);
  expect(part.size.w).toBeGreaterThan(0);
  expect(part.size.h).toBeGreaterThan(0);
  expect(part.size.d).toBeGreaterThan(0);
  expectWithinFootprint(part);

  // Features have unique ids, sizes, and notes a person can read.
  const featureIds = part.features.map((feature) => feature.id);
  expect(new Set(featureIds).size).toBe(featureIds.length);
  for (const feature of part.features) {
    expect(feature.w).toBeGreaterThan(0);
    expect(feature.h).toBeGreaterThan(0);
    expect(feature.note.length).toBeGreaterThan(15);
  }
  expectCircuitGraph(part);

  // Animated ids point at real solids.
  const solidIds = new Set(
    part.solids.map((solid) => ("id" in solid ? solid.id : undefined)).filter(Boolean),
  );
  for (const id of [
    ...(part.animate?.lit ?? []),
    ...(part.animate?.spin ?? []),
    ...(part.animate?.sweep ?? []),
  ]) {
    expect(solidIds.has(id), `${part.id}: animate id ${id}`).toBe(true);
  }

  // The lab can wire it, and every pin it can wire has a place on the part's canvas.
  expect(hasPinout(part.id)).toBe(true);
  if (part.canvas) {
    const holes = new Set(Object.keys(part.canvas.pins));
    for (const pin of getPinout(part.id).pins)
      expect(holes.has(pin.id), `${part.id}: pin ${pin.id} on the canvas`).toBe(true);
  }
}
