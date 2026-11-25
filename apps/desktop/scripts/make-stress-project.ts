/**
 * Writes the DSK-21 test project: 40 parts and 200 wires, laid out as a busy
 * classroom build would be. Used by scripts/measure-lab.mjs. STRESS_PARTS and
 * STRESS_WIRES change the size, to compare against a small build.
 *
 *   node --import tsx scripts/make-stress-project.ts <folder>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planAutoWire } from "@kiungo/core/lab/autowire";
import { getPinout } from "@kiungo/core/lab/pinout";
import { makeId, newSession, nextLabel } from "@kiungo/core/lab/session";
import type { LabNode, LabWire } from "@kiungo/core/lab/types";
import { CIRCUIT_FILE, PROJECT_FILE, PROJECT_FORMAT, PROJECT_VERSION, serializeCircuit, serializeProjectMeta, SKETCH_DIR, SKETCH_FILE, BLANK_SKETCH } from "@kiungo/core/project";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node --import tsx scripts/make-stress-project.ts <folder>");
  process.exit(1);
}

const PARTS_PER_BOARD = ["led", "servo", "dht11", "hc-sr04", "pir", "buzzer", "relay", "ldr", "lcd-16x2"];
const BOARDS = 4;
const TARGET_PARTS = Number(process.env.STRESS_PARTS ?? 40);
const TARGET_WIRES = Number(process.env.STRESS_WIRES ?? 200);

let nodes: LabNode[] = [];
let wires: LabWire[] = [];
const add = (partId: string, x: number, y: number) => {
  const node: LabNode = { id: makeId("n"), partId, label: nextLabel(nodes, partId), x, y, mode: "virtual" };
  nodes = [...nodes, node];
  return node;
};

// Four boards across the top, each with its parts in a grid below it, auto-wired.
for (let b = 0; b < BOARDS && nodes.length < TARGET_PARTS; b++) {
  const board = add("arduino-mega", 80 + b * 900, 80);
  PARTS_PER_BOARD.forEach((partId, i) => {
    if (nodes.length >= TARGET_PARTS) return;
    const node = add(partId, 80 + b * 900 + (i % 3) * 290, 520 + Math.floor(i / 3) * 300);
    const plan = planAutoWire(node, nodes, wires, board.id);
    wires = [...wires, ...plan.wires.map((w) => ({ id: makeId("w"), from: w.from, to: w.to }))];
  });
}

// Then jumpers from board to board, as shared buses and signals are in a big build, until there are 200 wires.
const boards = nodes.filter((n) => getPinout(n.partId).controller);
const seen = new Set(wires.map((w) => [`${w.from.node}:${w.from.pin}`, `${w.to.node}:${w.to.pin}`].sort().join("|")));
for (let k = 0; wires.length < TARGET_WIRES && k < 20_000; k++) {
  const a = boards[k % boards.length];
  const b = boards[(k + 1 + (Math.floor(k / boards.length) % (boards.length - 1))) % boards.length];
  if (a.id === b.id) continue;
  const pinsA = getPinout(a.partId).pins;
  const pinsB = getPinout(b.partId).pins;
  const from = { node: a.id, pin: pinsA[(k * 5) % pinsA.length].id };
  const to = { node: b.id, pin: pinsB[(k * 3 + 1) % pinsB.length].id };
  const key = [`${from.node}:${from.pin}`, `${to.node}:${to.pin}`].sort().join("|");
  if (seen.has(key)) continue;
  seen.add(key);
  wires.push({ id: makeId("w"), from, to });
}

const session = newSession({ name: `Stress test: ${nodes.length} parts, ${wires.length} wires`, nodes, wires });
const at = new Date().toISOString();
mkdirSync(join(folder, SKETCH_DIR), { recursive: true });
writeFileSync(join(folder, SKETCH_DIR, SKETCH_FILE), BLANK_SKETCH);
writeFileSync(join(folder, CIRCUIT_FILE), serializeCircuit(session, "Kiungo stress test"));
writeFileSync(join(folder, PROJECT_FILE), serializeProjectMeta({ format: PROJECT_FORMAT, version: PROJECT_VERSION, id: makeId("prj"), name: session.name, board: "arduino-mega", starter: null, createdAt: at, updatedAt: at }));
console.log(JSON.stringify({ folder, parts: nodes.length, wires: wires.length }));
