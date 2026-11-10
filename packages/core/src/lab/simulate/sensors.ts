import type { Analysis } from "../circuit";
import { isSensorPart } from "../controls";
import { boardSettings, sampleSensor, type Inputs, type SensorSample } from "../sketch";
import type { LabNode } from "../types";
import { boardFor, runnable, square, type NodeLive } from "./live";

/** What the sensors give the boards' sketches at one moment. */
export interface SensorPass {
  samplesByBoard: Map<string, SensorSample[]>;
  /** Sensors wired to a board that can't give a reading (no power, no ground, signal unwired): the sketch gets no data. */
  silentByBoard: Map<string, LabNode[]>;
}

const THRESHOLD_SENSORS = new Set(["soil-moisture", "mq2"]);

/** The level a sensor puts on one of its linked pins. */
function sensorPinValue(role: string, partId: string, sample: SensorSample, t: number): number {
  if (role === "out-analog") return sample.level;
  if (role === "out-digital")
    return THRESHOLD_SENSORS.has(partId) ? (sample.level < 0.3 ? 0 : 1) : sample.level;
  return square(t, 2, 0.08);
}

/** Sensors first: the sketch on each board reads them before deciding anything. */
export function readSensors(
  nodes: LabNode[],
  analysis: Analysis,
  moment: { t: number; running: boolean; inputs: Inputs },
  out: { live: Record<string, NodeLive>; pins: Record<string, number> },
): SensorPass {
  const { t, running, inputs } = moment;
  const { live, pins } = out;
  const samplesByBoard = new Map<string, SensorSample[]>();
  const silentByBoard = new Map<string, LabNode[]>();
  for (const node of nodes) {
    if (!isSensorPart(node.partId)) continue;
    const report = analysis.nodes[node.id];
    const ready = runnable(report);
    const board = boardFor(report);
    if (!ready || !running) {
      live[node.id] = { on: false, level: 0, readings: [], badge: ready ? "Ready" : undefined };
      if (running && !ready && board)
        silentByBoard.set(board, [...(silentByBoard.get(board) ?? []), node]);
      continue;
    }
    const sample = sampleSensor(node, t, inputs, boardSettings(board, inputs));
    if (board) samplesByBoard.set(board, [...(samplesByBoard.get(board) ?? []), sample]);
    live[node.id] = {
      on: sample.on,
      level: sample.level,
      readings: sample.readings,
      badge: sample.held ? `${sample.badge} (set)` : sample.badge,
    };
    for (const link of report!.links) {
      const value = sensorPinValue(link.role, node.partId, sample, t);
      pins[`${node.id}:${link.pin}`] = value;
      pins[`${link.board}:${link.boardPin}`] = value;
    }
  }
  return { samplesByBoard, silentByBoard };
}
