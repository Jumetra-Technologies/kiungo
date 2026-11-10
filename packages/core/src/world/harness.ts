/**
 * Runs a robot's compiled program in its world with no screen: the emulated
 * board, its part models and the physics, stepped together in simulated time.
 * The desktop app's worker does the same against the wall clock; CI uses this
 * to check the robot templates finish their courses (sprint 8).
 */

import { BOARDS } from "../boards";
import { AvrBoard } from "../emulator/avr";
import { Peripherals, type PeripheralInput } from "../emulator/peripherals";
import { PinStats, type PinReading } from "../emulator/pinstats";
import { motorDuty, worldInputs, type RobotWiring } from "./robot";
import { initPhysics, RobotWorld } from "./sim";
import type { RobotSpec, WorldSpec, WorldState } from "./types";

/** One step of the board and the world: 10 ms of simulated time. */
export const COUPLING_MS = 10;

/** The board and the world, stepped together. */
export class RobotRun {
  readonly board: AvrBoard;
  readonly world: RobotWorld;
  private readonly peripherals: Peripherals;
  private readonly stats: PinStats;
  private others: PeripheralInput[] = [];
  private readonly worldIds: Set<string>;
  serial = "";

  constructor(
    hex: string | AvrBoard,
    private readonly wiring: RobotWiring,
    world: WorldSpec,
    readonly robot: RobotSpec,
    /** The worker shares its board's part models; the harness makes its own. */
    shared?: { peripherals: Peripherals; stats: PinStats },
  ) {
    this.board = typeof hex === "string" ? new AvrBoard(BOARDS.uno, hex) : hex;
    if (shared) {
      this.peripherals = shared.peripherals;
      this.stats = shared.stats;
    } else {
      this.board.onSerialByte((b) => (this.serial += String.fromCharCode(b)));
      this.peripherals = new Peripherals(this.board);
      this.stats = new PinStats(
        this.board.board.clockHz,
        this.board.board.pins.map((p) => p.arduino),
      );
      this.board.onPinChange((c) => this.stats.record(c));
    }
    this.world = new RobotWorld(world, robot);
    this.worldIds = new Set(robot.sensors.map((s) => s.nodeId));
    this.applySensors();
  }

  /** Inputs for parts that aren't the robot's own sensors (the lab's sweep or the Inspector). */
  setOtherInputs(inputs: PeripheralInput[]): void {
    this.others = inputs.filter((i) => !this.worldIds.has(i.id.split(":")[0]));
    this.applySensors();
  }

  private applySensors(): void {
    const own = worldInputs(this.wiring, this.world.sense());
    this.peripherals.apply([...this.others, ...own]);
  }

  /** Run the board for one coupling step, then move the world by the same time. Returns the pins over that step. */
  step(): PinReading[] {
    this.board.runMs(COUPLING_MS);
    const pins = this.stats.take(this.board.cycles);
    this.move(pins, COUPLING_MS / 1000);
    return pins;
  }

  /** Move the world by `dt` seconds with the motors as these pin readings drive them. */
  move(pins: PinReading[], dt: number): void {
    const byPin = new Map(pins.map((p) => [p.pin, p]));
    this.world.step(dt, motorDuty(this.wiring.left, byPin), motorDuty(this.wiring.right, byPin));
    this.applySensors();
  }

  dispose(): void {
    this.world.dispose();
  }
}

/** Run a course for up to `seconds` of simulated time, or until it's finished. */
export async function runCourse(opts: {
  hex: string;
  wiring: RobotWiring;
  world: WorldSpec;
  robot: RobotSpec;
  seconds: number;
}): Promise<{
  state: WorldState;
  path: Array<[number, number]>;
  serial: string;
  simSeconds: number;
}> {
  await initPhysics();
  const run = new RobotRun(opts.hex, opts.wiring, opts.world, opts.robot);
  const path: Array<[number, number]> = [];
  const steps = Math.round((opts.seconds * 1000) / COUPLING_MS);
  let state = run.world.state();
  for (let i = 0; i < steps; i++) {
    run.step();
    if (i % 10 === 0) {
      state = run.world.state();
      path.push([state.robot.x, state.robot.y]);
      if (state.finished || run.board.crashed) break;
    }
  }
  state = run.world.state();
  const serial = run.serial;
  const simSeconds = run.board.timeMs / 1000;
  run.dispose();
  return { state, path, serial, simSeconds };
}
