/**
 * Messages between the app and an emulator worker. One worker runs one board.
 *
 * Pin levels go through a SharedArrayBuffer when the page is cross-origin
 * isolated: the worker writes, the interface reads on each frame, and nothing
 * is posted per pin change. Without isolation the worker posts the changes.
 */
import type { BoardDefinition } from "../boards";
import type { CrashKind, PinChange, PinLevel } from "./avr";
import type { PeripheralInput } from "./peripherals";
import type { PinReading } from "./pinstats";
import type { RobotWiring } from "../world/robot";
import type { RobotSpec, WorldObstacle, WorldSpec, WorldState } from "../world/types";

export type { CrashKind, PeripheralInput, PinChange, PinLevel, PinReading };

/** Byte codes for pin levels in the shared buffer. */
export const LEVEL_CODES: Record<PinLevel, number> = { input: 0, low: 1, high: 2, pullup: 3 };
export const LEVEL_NAMES: readonly PinLevel[] = ["input", "low", "high", "pullup"];

/** Slots in the shared buffer: one byte per Arduino pin number 0 to 31. */
export const PIN_SLOTS = 32;

export type ToWorker =
  | { type: "load"; board: BoardDefinition["id"]; hex: string; pins?: SharedArrayBuffer }
  | { type: "start" }
  | { type: "stop" }
  | { type: "input"; pin: number; high: boolean }
  /** The parts wired to the board and what they read now; replaces the previous set. */
  | { type: "peripherals"; inputs: PeripheralInput[] }
  /** Text typed into the serial monitor, to the board's RX. */
  | { type: "serial-in"; text: string }
  /** Put the board in a robot that drives in this world (sprint 8). Send after "load", before "start". */
  | { type: "world"; world: WorldSpec; robot: RobotSpec; wiring: RobotWiring }
  /** Obstacles moved while the robot runs. */
  | { type: "world-obstacles"; obstacles: WorldObstacle[] };

export type FromWorker =
  | { type: "loaded"; programBytes: number }
  | { type: "status"; running: boolean; simMs: number; speedPercent: number }
  | { type: "pins"; changes: PinChange[] }
  | { type: "serial"; text: string }
  | { type: "error"; message: string }
  /** What every pin did since the last readings, with the run's speed (about 20 a second). */
  | { type: "readings"; simMs: number; speedPercent: number; pins: PinReading[]; crashed: CrashKind | null; world?: WorldState }
  /** The world is ready (its physics loaded): "start" can follow. */
  | { type: "world-ready" };
