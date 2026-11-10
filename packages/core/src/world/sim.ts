/**
 * The robot in its world (WLD-01 to WLD-03): Rapier 2D physics for the
 * chassis against the walls and obstacles, the wheels driven by the motors'
 * signed duty, and sensors that measure the world's geometry: the HC-SR04 by
 * casting rays across its cone, a floor sensor by checking whether the line
 * is under it. Stepped at a fixed rate in simulated time, so a run is the
 * same every time.
 */

import RAPIER from "@dimforge/rapier2d-compat";
import type { Pose, RobotSpec, WorldObstacle, WorldSpec, WorldState } from "./types";

/** Physics steps per simulated second. */
export const WORLD_HZ = 120;
/** The HC-SR04's cone is about 15° wide; three rays across it find the nearest echo. */
const SONAR_HALF_ANGLE = (7.5 * Math.PI) / 180;
const SONAR_RANGE_M = 4;

let ready: Promise<void> | null = null;
/** Load Rapier's WebAssembly once (it's inlined, so this works offline and in a worker). */
export function initPhysics(): Promise<void> {
  return (ready ??= RAPIER.init());
}

/** Signed duty of one motor, -1 (full reverse) to 1 (full forward), from its driver pins. */
export interface MotorCommand {
  duty: number;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether the point is on the line, within half its width. */
export function onLine(spec: WorldSpec, x: number, y: number): boolean {
  const line = spec.line;
  if (!line || line.points.length < 2) return false;
  const pts = line.points;
  const n = line.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (distanceToSegment(x, y, a[0], a[1], b[0], b[1]) <= line.width / 2) return true;
  }
  return false;
}

/** A point on the robot, in the world. */
export function toWorld(robot: Pose, local: { x: number; y: number }): [number, number] {
  const c = Math.cos(robot.heading);
  const s = Math.sin(robot.heading);
  return [robot.x + local.x * c - local.y * s, robot.y + local.x * s + local.y * c];
}

export class RobotWorld {
  private readonly world: RAPIER.World;
  private readonly body: RAPIER.RigidBody;
  private readonly chassis: RAPIER.Collider;
  private obstacleColliders = new Map<string, RAPIER.Collider>();
  private readonly events = new RAPIER.EventQueue(true);
  private t = 0;
  private collisions = 0;
  private touching = 0;
  private checkpoint = 0;
  private odometer = 0;
  private speed = 0;
  private last: Pose;
  /** Colliders changed since the last step: the ray queries need the scene brought up to date. */
  private stale = true;
  spec: WorldSpec;

  /** Call `await initPhysics()` first. */
  constructor(
    spec: WorldSpec,
    readonly robot: RobotSpec,
  ) {
    this.spec = spec;
    this.world = new RAPIER.World({ x: 0, y: 0 });
    this.world.timestep = 1 / WORLD_HZ;
    // The arena's walls.
    const { w, h } = spec.arena;
    const wall = 0.05;
    for (const [x, y, hw, hh] of [
      [w / 2, -wall / 2, w / 2 + wall, wall / 2],
      [w / 2, h + wall / 2, w / 2 + wall, wall / 2],
      [-wall / 2, h / 2, wall / 2, h / 2 + wall],
      [w + wall / 2, h / 2, wall / 2, h / 2 + wall],
    ] as const) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh).setTranslation(x, y));
    }
    this.setObstacles(spec.obstacles);
    const s = spec.start;
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.x, s.y)
        .setRotation(s.heading)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    this.chassis = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(robot.length / 2, robot.width / 2)
        .setDensity(400)
        .setFriction(0.6)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    this.last = { ...s };
  }

  /** Move, add or remove obstacles while the robot runs (Brad moves walls). */
  setObstacles(obstacles: WorldObstacle[]): void {
    const keep = new Set(obstacles.map((o) => o.id));
    for (const [id, collider] of this.obstacleColliders) {
      if (!keep.has(id)) {
        this.world.removeCollider(collider, false);
        this.obstacleColliders.delete(id);
      }
    }
    for (const o of obstacles) {
      const existing = this.obstacleColliders.get(o.id);
      if (existing) this.world.removeCollider(existing, false);
      this.obstacleColliders.set(
        o.id,
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2)
            .setTranslation(o.x, o.y)
            .setRotation(o.angle),
        ),
      );
    }
    this.spec = { ...this.spec, obstacles };
    this.stale = true;
  }

  /** Bring the scene the rays see up to date without moving anything (a zero-length step). */
  private refresh(): void {
    if (!this.stale) return;
    const dt = this.world.timestep;
    this.world.timestep = 0;
    this.world.step(this.events);
    this.events.drainCollisionEvents(() => undefined);
    this.world.timestep = dt;
    this.stale = false;
  }

  pose(): Pose {
    const p = this.body.translation();
    return { x: p.x, y: p.y, heading: this.body.rotation() };
  }

  /**
   * Advance by `dt` seconds with the motors' signed duties. The wheels set
   * the chassis' velocity (a geared TT motor holds its speed); the physics
   * then stops it at walls instead of letting it pass through.
   */
  step(dt: number, left: number, right: number): void {
    const steps = Math.max(1, Math.round(dt * WORLD_HZ));
    const wheel = (duty: number) =>
      Math.max(-1, Math.min(1, duty)) *
      ((this.robot.maxRpm * 2 * Math.PI) / 60) *
      this.robot.wheelRadius;
    const vl = wheel(left);
    const vr = wheel(right);
    for (let i = 0; i < steps; i++) {
      const { heading } = this.pose();
      const v = (vl + vr) / 2;
      this.body.setLinvel({ x: v * Math.cos(heading), y: v * Math.sin(heading) }, true);
      this.body.setAngvel((vr - vl) / this.robot.track, true);
      this.world.step(this.events);
      this.stale = false;
      this.events.drainCollisionEvents((a, b, started) => {
        if (a !== this.chassis.handle && b !== this.chassis.handle) return;
        if (started) {
          this.touching++;
          this.collisions++;
        } else this.touching = Math.max(0, this.touching - 1);
      });
      const now = this.pose();
      const moved = Math.hypot(now.x - this.last.x, now.y - this.last.y);
      this.odometer += moved;
      this.speed =
        moved *
        WORLD_HZ *
        Math.sign(
          Math.cos(now.heading) * (now.x - this.last.x) +
            Math.sin(now.heading) * (now.y - this.last.y) || 1,
        );
      this.last = now;
      this.t += 1 / WORLD_HZ;
      const next = this.spec.checkpoints[this.checkpoint];
      if (next && Math.hypot(now.x - next.x, now.y - next.y) <= next.r) this.checkpoint++;
    }
  }

  /** What each sensor measures now. */
  sense(): WorldState["sensors"] {
    this.refresh();
    const out: WorldState["sensors"] = {};
    const robot = this.pose();
    for (const sensor of this.robot.sensors) {
      const [x, y] = toWorld(robot, sensor.pose);
      if (sensor.kind === "floor") {
        out[sensor.nodeId] = { dark: onLine(this.spec, x, y) };
        continue;
      }
      let best: { d: number; at: [number, number] } | null = null;
      for (const da of [-SONAR_HALF_ANGLE, 0, SONAR_HALF_ANGLE]) {
        const a = robot.heading + sensor.pose.heading + da;
        const ray = new RAPIER.Ray({ x, y }, { x: Math.cos(a), y: Math.sin(a) });
        const hit = this.world.castRay(
          ray,
          SONAR_RANGE_M,
          true,
          undefined,
          undefined,
          this.chassis,
          this.body,
        );
        if (hit && (!best || hit.timeOfImpact < best.d))
          best = {
            d: hit.timeOfImpact,
            at: [x + Math.cos(a) * hit.timeOfImpact, y + Math.sin(a) * hit.timeOfImpact],
          };
      }
      // Nothing within 4 m: out of range, as the module reports it.
      out[sensor.nodeId] = { distanceCm: best ? best.d * 100 : 500, hit: best?.at ?? null };
    }
    return out;
  }

  state(): WorldState {
    return {
      t: this.t,
      robot: this.pose(),
      speed: this.speed,
      sensors: this.sense(),
      collisions: this.collisions,
      touching: this.touching > 0,
      checkpoints: this.checkpoint,
      finished: this.spec.checkpoints.length > 0 && this.checkpoint >= this.spec.checkpoints.length,
      odometer: this.odometer,
    };
  }

  dispose(): void {
    this.events.free();
    this.world.free();
  }
}
