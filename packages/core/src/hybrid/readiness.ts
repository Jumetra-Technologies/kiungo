/**
 * Readiness (VER-01, VER-03): where each part of the circuit lives in a run,
 * and what to have on the desk.
 *
 * - Virtual: the lab plays it. With a real board, the sketch reads the lab's value.
 * - Real: on the desk, wired to the real board.
 * - Hybrid: the real board running the code, with virtual parts answering it.
 * - Not available: marked Virtual, but Kiungo can't play it on a real board yet.
 *
 * The bill of materials lists what a build needs: on the desk now (the parts
 * marked Physical, the real board and what joins them), or everything, to
 * build it all for real.
 */

import type { Analysis } from "../lab/circuit";
import { getPinout } from "../lab/pinout";
import type { LabNode, LabWire } from "../lab/types";
import { getPart } from "../parts";
import { boardIsReal, hybridBindings, isVirtual } from "./plan";

export type PartRunStatus = "virtual" | "real" | "hybrid" | "unavailable";

export interface PartReadiness {
  nodeId: string;
  label: string;
  status: PartRunStatus;
  /** One line on what that means for this part. */
  why: string;
}

const isBoard = (n: LabNode) => getPinout(n.partId).controller;
const isPassive = (n: LabNode) => Boolean(getPinout(n.partId).passive) || n.partId === "resistor";

interface RowCtx {
  nodes: LabNode[];
  analysis: Analysis;
  /** Virtual parts the Hybrid shim plays, and boards or parts it can't. */
  virtualById: Map<string, { played: boolean; why?: string }>;
  onRealBoard: (n: LabNode) => boolean;
}

function boardRow({ nodes, analysis, virtualById }: RowCtx, n: LabNode): PartReadiness {
  const base = { nodeId: n.id, label: n.label };
  if (!boardIsReal(n))
    return {
      ...base,
      status: "virtual",
      why: "Emulated in the lab: your code runs on a simulated chip.",
    };
  const plays = nodes.some(
    (p) =>
      virtualById.get(p.id)?.played && analysis.nodes[p.id]?.links.some((l) => l.board === n.id),
  );
  const problem = virtualById.get(n.id);
  if (problem && !problem.played) return { ...base, status: "unavailable", why: problem.why ?? "" };
  return plays
    ? {
        ...base,
        status: "hybrid",
        why: "The real board runs your code; virtual parts answer it from the lab.",
      }
    : { ...base, status: "real", why: "The real board runs your code, with real parts only." };
}

function partRow({ virtualById, onRealBoard }: RowCtx, n: LabNode): PartReadiness {
  const base = { nodeId: n.id, label: n.label };
  if (isPassive(n))
    return {
      ...base,
      status: onRealBoard(n) || !isVirtual(n) ? "real" : "virtual",
      why: "Joins pins: the same in the lab and on the desk.",
    };
  const v = virtualById.get(n.id);
  if (v && !v.played) return { ...base, status: "unavailable", why: v.why ?? "" };
  if (!isVirtual(n))
    return {
      ...base,
      status: "real",
      why: onRealBoard(n)
        ? "On the desk: the real board reads or drives it."
        : "Marked Physical, but not wired to a real board: Run plays it in the lab.",
    };
  if (v?.played)
    return {
      ...base,
      status: "virtual",
      why: "Played by the lab: the sketch on the real board reads the value you set.",
    };
  if (onRealBoard(n))
    return {
      ...base,
      status: "virtual",
      why: "The real board drives this pin; the lab shows what it does. Wire the real one to see it on the desk.",
    };
  return { ...base, status: "virtual", why: "Simulated in the lab." };
}

/** Each part's status in a run, boards first. */
export function partReadiness(nodes: LabNode[], analysis: Analysis): PartReadiness[] {
  const realBoards = nodes.filter((n) => isBoard(n) && boardIsReal(n));
  const virtualById = new Map<string, { played: boolean; why?: string }>();
  for (const board of realBoards) {
    try {
      const b = hybridBindings(nodes, analysis, board.id);
      for (const s of b.sensors) virtualById.set(s.nodeId, { played: true });
      for (const u of b.unsupported) virtualById.set(u.node.id, { played: false, why: u.why });
    } catch (e) {
      virtualById.set(board.id, { played: false, why: (e as Error).message });
    }
  }
  const onRealBoard = (n: LabNode) =>
    realBoards.some((b) => analysis.nodes[n.id]?.links.some((l) => l.board === b.id));

  const ctx: RowCtx = { nodes, analysis, virtualById, onRealBoard };
  const rows = nodes.map((n): PartReadiness => (isBoard(n) ? boardRow(ctx, n) : partRow(ctx, n)));
  const rank = (r: PartReadiness) => (isBoard(nodes.find((n) => n.id === r.nodeId)!) ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b));
}

export interface BomLine {
  /** The part id, or an extra ("jumper-wire", "usb-cable", "battery-pack"). */
  id: string;
  name: string;
  quantity: number;
  note?: string;
}

/**
 * What to have on the desk. `scope: "desk"` lists the real board and the parts
 * marked Physical; `"all"` lists everything, to build the whole circuit for real.
 */
export function billOfMaterials(
  nodes: LabNode[],
  wires: LabWire[],
  scope: "desk" | "all",
): BomLine[] {
  const chosen = nodes.filter(
    (n) => scope === "all" || (isBoard(n) ? boardIsReal(n) : !isVirtual(n) || isPassive(n)),
  );
  const ids = new Set(chosen.map((n) => n.id));
  // On the desk, a passive part only counts when it joins something that's there.
  const touches = (n: LabNode) =>
    wires.some(
      (w) =>
        (w.from.node === n.id && ids.has(w.to.node) && w.to.node !== n.id) ||
        (w.to.node === n.id && ids.has(w.from.node) && w.from.node !== n.id),
    );
  const parts =
    scope === "all" ? chosen : chosen.filter((n) => !isPassive(n) || touches(n) || !isVirtual(n));
  const kept = new Set(parts.map((n) => n.id));
  const lines = new Map<string, BomLine>();
  for (const n of parts) {
    const line = lines.get(n.partId) ?? {
      id: n.partId,
      name: getPart(n.partId)?.name ?? n.label,
      quantity: 0,
    };
    line.quantity++;
    lines.set(n.partId, line);
  }
  const out = [...lines.values()].sort(
    (a, b) =>
      Number(isBoard({ partId: b.id } as LabNode)) - Number(isBoard({ partId: a.id } as LabNode)) ||
      a.name.localeCompare(b.name),
  );
  const jumpers = wires.filter((w) => kept.has(w.from.node) && kept.has(w.to.node)).length;
  if (jumpers)
    out.push({
      id: "jumper-wire",
      name: "Jumper wires",
      quantity: jumpers,
      note: "Male-to-male for a breadboard; male-to-female for modules with pins.",
    });
  const boards = parts.filter(isBoard).length;
  if (boards)
    out.push({
      id: "usb-cable",
      name: "USB cable for the board",
      quantity: boards,
      note: "A data cable, not a charge-only one.",
    });
  if (parts.some((n) => n.partId === "dc-motor" || n.partId === "stepper-motor"))
    out.push({
      id: "battery-pack",
      name: "Battery pack for the motors",
      quantity: 1,
      note: "4 × AA (6 V) or a 2-cell Li-ion pack, with its GND joined to the board's.",
    });
  return out;
}

/** The bill of materials as CSV, for a spreadsheet or a shop's basket. */
export function bomCsv(lines: BomLine[]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return (
    [
      "Part,Quantity,Notes",
      ...lines.map((l) => [cell(l.name), String(l.quantity), cell(l.note ?? "")].join(",")),
    ].join("\n") + "\n"
  );
}

/** The bill of materials as plain text, one line each. */
export function bomText(lines: BomLine[]): string {
  return lines.map((l) => `${l.quantity} × ${l.name}${l.note ? ` (${l.note})` : ""}`).join("\n");
}
