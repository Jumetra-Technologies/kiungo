/**
 * A world for a robot to drive in (WLD-01): a flat arena with solid
 * obstacles and, for line followers, a line on the floor. Lengths in meters,
 * angles in radians, x to the right and y up, heading 0 along +x.
 */

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

export interface WorldObstacle {
  id: string;
  /** Center and size; boxes only for now. */
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export interface WorldLine {
  /** A path on the floor, through these points. */
  points: Array<[number, number]>;
  /** Tape width: 19 mm is standard electrical tape. */
  width: number;
  closed: boolean;
}

export interface WorldSpec {
  version: 1;
  arena: { w: number; h: number };
  obstacles: WorldObstacle[];
  line: WorldLine | null;
  start: Pose;
  /** Checkpoints a run passes in order to finish the course (the line follower's lap, the avoider's goal). */
  checkpoints: Array<{ x: number; y: number; r: number }>;
}

export type SensorKind = "distance" | "floor";

/** A sensor fixed on the chassis (WLD-05): where it sits and which way it looks, relative to the robot's center. */
export interface MountedSensor {
  /** The lab node it is. */
  nodeId: string;
  kind: SensorKind;
  pose: Pose;
}

/** The robot as the circuit makes it (OUT-03): a two-wheel chassis whose motors and sensors are lab parts. */
export interface RobotSpec {
  /** Chassis footprint, meters. */
  length: number;
  width: number;
  wheelRadius: number;
  /** Distance between the wheels. */
  track: number;
  /** Wheel speed at full duty, revolutions per minute. */
  maxRpm: number;
  /** The lab nodes of the left and right motors. */
  motors: { left: string; right: string };
  sensors: MountedSensor[];
}

export interface WorldState {
  /** Simulated seconds. */
  t: number;
  robot: Pose;
  /** Meters per second, forward. */
  speed: number;
  /** What each sensor sees now. */
  sensors: Record<string, { distanceCm?: number; dark?: boolean; hit?: [number, number] | null }>;
  /** Times the chassis has hit something since the run started. */
  collisions: number;
  touching: boolean;
  /** How many checkpoints have been passed, in order. */
  checkpoints: number;
  finished: boolean;
  /** Meters driven. */
  odometer: number;
}
