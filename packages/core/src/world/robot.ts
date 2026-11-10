/**
 * The robot as the circuit makes it (OUT-03): the board's two DC motors are
 * its wheels, its HC-SR04 looks forward from the front, and its light
 * sensors look down at the floor either side of the middle, where a line
 * follower's are (WLD-05). The world turns the program's motor pins into
 * wheel speeds, and its sensors' readings into what the program reads.
 */

import type { PeripheralInput } from "../emulator/peripherals";
import type { PinReading } from "../emulator/pinstats";
import type { Analysis } from "../lab/circuit";
import { arduinoPinOf } from "../lab/program";
import type { LabNode } from "../lab/types";
import type { RobotSpec, WorldState } from "./types";

/** A two-wheel chassis kit: 20 cm by 14 cm, 65 mm wheels, TT gear motors. */
export const CHASSIS = { length: 0.2, width: 0.14, wheelRadius: 0.0325, track: 0.13, maxRpm: 140 };

/** Floor sensors either side of the middle: 3 cm apart, wider than 19 mm tape, so both see white on the line. */
const FLOOR_OFFSET_Y = 0.015;

/** "DC motor 2" sorts after "DC motor 1": the first motor is the left wheel. */
const byLabel = (a: LabNode, b: LabNode) => a.label.localeCompare(b.label, "en", { numeric: true });

/** The robot the circuit makes, or null if the board doesn't have two motors. */
export function robotFromCircuit(
  nodes: LabNode[],
  analysis: Analysis,
  boardId: string,
): RobotSpec | null {
  const on = (n: LabNode) => analysis.nodes[n.id]?.links.some((l) => l.board === boardId);
  const motors = nodes.filter((n) => n.partId === "dc-motor" && on(n)).sort(byLabel);
  const [left, right] = motors;
  if (!left || !right) return null;
  const sonars = nodes.filter((n) => n.partId === "hc-sr04" && on(n)).sort(byLabel);
  const floors = nodes.filter((n) => n.partId === "ldr" && on(n)).sort(byLabel);
  const front = CHASSIS.length / 2;
  return {
    ...CHASSIS,
    motors: { left: left.id, right: right.id },
    sensors: [
      ...sonars.slice(0, 1).map((n) => ({
        nodeId: n.id,
        kind: "distance" as const,
        pose: { x: front, y: 0, heading: 0 },
      })),
      // Left sensor first: +y is the robot's left.
      ...floors.slice(0, 2).map((n, i) => ({
        nodeId: n.id,
        kind: "floor" as const,
        pose: { x: front - 0.01, y: i === 0 ? FLOOR_OFFSET_Y : -FLOOR_OFFSET_Y, heading: 0 },
      })),
    ],
  };
}

/** Which board pins drive each wheel and read each sensor: what the emulator's worker needs, with no circuit. */
export interface RobotWiring {
  /** Arduino pin numbers; `en` null when EN isn't wired (the driver then runs at full speed). */
  left: { en: number | null; in1: number | null; in2: number | null };
  right: { en: number | null; in1: number | null; in2: number | null };
  sensors: Array<
    | { nodeId: string; kind: "distance"; trig: number; echo: number }
    | { nodeId: string; kind: "floor"; pin: number }
  >;
}

export function robotWiring(
  robot: RobotSpec,
  nodes: LabNode[],
  analysis: Analysis,
  boardId: string,
): RobotWiring {
  const pinOf = (nodeId: string, pin: string) => {
    const l = analysis.nodes[nodeId]?.links.find((x) => x.pin === pin && x.board === boardId);
    return l ? arduinoPinOf(l.boardPin) : null;
  };
  const motor = (id: string) => ({
    en: pinOf(id, "EN"),
    in1: pinOf(id, "IN1"),
    in2: pinOf(id, "IN2"),
  });
  const sensors: RobotWiring["sensors"] = [];
  for (const s of robot.sensors) {
    if (!nodes.some((n) => n.id === s.nodeId)) continue;
    if (s.kind === "distance") {
      const trig = pinOf(s.nodeId, "TRIG");
      const echo = pinOf(s.nodeId, "ECHO");
      if (trig !== null && echo !== null)
        sensors.push({ nodeId: s.nodeId, kind: "distance", trig, echo });
    } else {
      const pin = pinOf(s.nodeId, "L2");
      if (pin !== null && pin >= 14) sensors.push({ nodeId: s.nodeId, kind: "floor", pin });
    }
  }
  return { left: motor(robot.motors.left), right: motor(robot.motors.right), sensors };
}

/**
 * A motor's signed duty from its driver pins: IN1 high and IN2 low turns it
 * forward at EN's PWM duty, the other way round turns it back, both the same
 * stops it. Without EN wired, the driver runs at full speed.
 */
export function motorDuty(
  motor: RobotWiring["left"],
  pins: ReadonlyMap<number, PinReading>,
): number {
  const read = (n: number | null) => (n === null ? null : (pins.get(n) ?? null));
  const en = read(motor.en);
  const duty =
    motor.en === null ? 1 : en && (en.level === "high" || en.level === "low") ? en.duty : 0;
  const in1 = (read(motor.in1)?.duty ?? 0) > 0.5;
  const in2 = (read(motor.in2)?.duty ?? 0) > 0.5;
  return in1 === in2 ? 0 : in1 ? duty : -duty;
}

/** What the program's sensors read from the world: distances for the HC-SR04, light for the floor sensors. */
export function worldInputs(
  wiring: RobotWiring,
  sensors: WorldState["sensors"],
  logicV = 5,
): PeripheralInput[] {
  return wiring.sensors.map((s): PeripheralInput => {
    const seen = sensors[s.nodeId];
    if (s.kind === "distance")
      return {
        kind: "hc-sr04",
        id: s.nodeId,
        trig: s.trig,
        echo: s.echo,
        distanceCm: seen?.distanceCm ?? 500,
      };
    // White floor reflects the sensor's LED: bright. Black tape doesn't: dark.
    return { kind: "analog", id: s.nodeId, pin: s.pin, volts: (seen?.dark ? 0.1 : 0.75) * logicV };
  });
}
