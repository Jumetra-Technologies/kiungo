/**
 * The lab running the user's own program (RUN-02, EMU-02, OUT-02, DBG-01).
 *
 * One board in the circuit runs the compiled sketch on the emulator. Its
 * parts show what the program does to the pins (an LED as bright as the
 * pin's PWM duty, a servo at the angle its pulse width means, a buzzer at
 * the pitch the pin toggles), and its sensors answer the program with the
 * values set in the Inspector or the lab's simulated sweep. Every other
 * board keeps its built-in behavior.
 */

import type { PeripheralInput } from "../emulator/peripherals";
import type { CrashKind, PinReading } from "../emulator/protocol";
import type { Analysis } from "./circuit";
import { getPinout } from "./pinout";
import {
  PROGRAM_OUTPUTS,
  fmt,
  isProgramSensor,
  notModeledLive,
  servoAngle,
  type ProgramPart,
} from "./program-parts";
import { SENSOR_INPUTS } from "./program-sensors";
import { wireFlows, type Frame, type NodeLive } from "./simulate";
import { boardSettings, sampleSensor, type Inputs } from "./sketch";
import type { LabNode, LabWire } from "./types";

export { isProgramSensor, servoAngle };

/** What the emulated board reported last. */
export interface ProgramReadings {
  /** The lab node running the program. */
  boardId: string;
  /** Simulated seconds since the program started. */
  t: number;
  /** Simulated time per wall-clock time, in percent: 100 is real time (RUN-05). */
  speedPercent: number;
  pins: PinReading[];
  crashed: CrashKind | null;
  /** A run on a real board (sprint 9): which one, "Arduino Uno on COM3". Omitted: the emulated board. */
  where?: string;
}

/** Boards whose chip Kiungo emulates now: the ATmega328P (EMU-01). */
export const EMULATED_PARTS = new Set(["arduino-uno"]);

/** The Arduino pin number of an Uno header pin: "D13" is 13, "A0" is 14. */
export function arduinoPinOf(boardPinId: string): number | null {
  const d = /^D(\d+)$/.exec(boardPinId);
  if (d) return Number(d[1]);
  const a = /^A(\d)$/.exec(boardPinId);
  if (a) return 14 + Number(a[1]);
  return null;
}

const pinLevel = (r: PinReading) => (r.level === "high" ? 1 : r.level === "low" ? 0 : r.duty);

/** The board running the program: its own pins as a logic analyser would show them, and its panel. */
function programBoardLive(
  board: LabNode,
  program: ProgramReadings,
  byPin: Map<number, PinReading>,
  pins: Record<string, number>,
): NodeLive {
  for (const pin of getPinout(board.partId).pins) {
    const n = arduinoPinOf(pin.id);
    const r = n === null ? undefined : byPin.get(n);
    if (r) pins[`${board.id}:${pin.id}`] = pinLevel(r);
  }
  const crashed = program.crashed !== null;
  const speed = program.speedPercent;
  const realTime = speed >= 97;
  return {
    on: !crashed,
    level: byPin.get(13)?.duty ?? 0,
    readings: [
      {
        label: "Sketch",
        value: crashed ? "Stopped: ran out of memory" : "Your code (sketch.ino)",
      },
      { label: "Uptime", value: `${fmt(program.t, 1)} s` },
      program.where
        ? { label: "Runs on", value: `The real ${program.where}` }
        : { label: "Speed", value: realTime ? "Real time" : `${speed} % of real time` },
    ],
    badge: programBadge(crashed, program.where, realTime, speed),
  };
}

function programBadge(
  crashed: boolean,
  where: string | undefined,
  realTime: boolean,
  speed: number,
) {
  if (crashed) return "Crashed";
  if (where) return "On board";
  return realTime ? "Running" : `${speed} %`;
}

/**
 * The frame with the program's board and the parts on it taken from the
 * emulator. Parts on other boards, and the wires' power, stay as `base` has them.
 */
export function programFrame(
  base: Frame,
  nodes: LabNode[],
  wires: LabWire[],
  analysis: Analysis,
  program: ProgramReadings,
): Frame {
  const byPin = new Map(program.pins.map((p) => [p.pin, p]));
  const reading = (boardPin: string): PinReading | undefined => {
    const n = arduinoPinOf(boardPin);
    return n === null ? undefined : byPin.get(n);
  };
  const live: Record<string, NodeLive> = { ...base.nodes };
  const pins: Record<string, number> = { ...base.pins };
  const t = program.t;

  const board = nodes.find((n) => n.id === program.boardId);
  if (board) live[board.id] = programBoardLive(board, program, byPin, pins);

  for (const node of nodes) {
    const report = analysis.nodes[node.id];
    if (!report?.powered || !report.links.some((l) => l.board === program.boardId)) continue;
    const link = (pin: string) =>
      report.links.find((l) => l.pin === pin && l.board === program.boardId);
    const part: ProgramPart = {
      node,
      report,
      previous: base.nodes[node.id],
      t,
      link,
      at: (pin) => {
        const l = link(pin);
        return l ? reading(l.boardPin) : undefined;
      },
      mirror: (pin, v) => {
        const l = link(pin);
        if (!l) return;
        pins[`${node.id}:${pin}`] = v;
        pins[`${l.board}:${l.boardPin}`] = v;
      },
    };
    const output = PROGRAM_OUTPUTS.get(node.partId);
    const frame = output ? output(part) : notModeledLive(node.partId);
    if (frame) live[node.id] = frame;
  }

  return {
    ...base,
    t,
    running: base.running,
    nodes: live,
    pins,
    wires: wireFlows(nodes, wires, analysis, pins, base.running),
  };
}

const OTHER_SENSORS = ["ds18b20", "mpu6050", "bmp280"];

/**
 * What the sensors wired to the program's board read now, as the emulator's
 * part models take them. `unsupported` lists sensors on the board the
 * emulator can't answer for yet (I2C and 1-Wire parts).
 */
export function peripheralInputs({
  nodes,
  analysis,
  inputs,
  boardId,
  t,
  logicV = 5,
}: {
  nodes: LabNode[];
  analysis: Analysis;
  inputs: Inputs;
  boardId: string;
  t: number;
  logicV?: number;
}): { inputs: PeripheralInput[]; unsupported: LabNode[] } {
  const out: PeripheralInput[] = [];
  const unsupported: LabNode[] = [];
  const settings = boardSettings(boardId, inputs);
  for (const node of nodes) {
    const report = analysis.nodes[node.id];
    if (!report?.links.some((l) => l.board === boardId) || getPinout(node.partId).controller)
      continue;
    const sensorLike = isProgramSensor(node.partId) || OTHER_SENSORS.includes(node.partId);
    // A sensor without power gives the program nothing, as on a bench.
    if (!sensorLike || !report.powered) continue;
    const sample = sampleSensor(node, t, inputs, settings);
    const read = SENSOR_INPUTS.get(node.partId);
    if (!read) {
      unsupported.push(node);
      continue;
    }
    read({
      node,
      pinOf: (pin) => {
        const l = report.links.find((x) => x.pin === pin && x.board === boardId);
        return l ? arduinoPinOf(l.boardPin) : null;
      },
      v: sample.values,
      settings,
      logicV,
      out,
    });
  }
  return { inputs: out, unsupported };
}
