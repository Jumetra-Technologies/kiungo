/**
 * The courses the robot templates are made for (PRJ-03), and an empty arena.
 * A course is the world file a new project starts with; the person can move
 * the obstacles, and Kiungo saves them in the project's `world.json`.
 */

import type { WorldSpec } from "./types";

export const WORLD_FILE = "world.json";

/** An oval of black tape: 1.3 m by 0.8 m, 19 mm wide. */
function oval(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 48,
): Array<[number, number]> {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [
      Math.round((cx + rx * Math.cos(a)) * 1000) / 1000,
      Math.round((cy + ry * Math.sin(a)) * 1000) / 1000,
    ];
  });
}

/** The line follower's course: one lap of the oval, counterclockwise, passing four checkpoints. */
export const LINE_COURSE: WorldSpec = {
  version: 1,
  arena: { w: 2, h: 1.4 },
  obstacles: [],
  line: { points: oval(1, 0.7, 0.65, 0.4), width: 0.019, closed: true },
  // On the line at the bottom of the oval, facing along it (counterclockwise).
  start: { x: 1, y: 0.3, heading: 0 },
  checkpoints: [
    { x: 1.65, y: 0.7, r: 0.12 },
    { x: 1, y: 1.1, r: 0.12 },
    { x: 0.35, y: 0.7, r: 0.12 },
    { x: 1, y: 0.3, r: 0.12 },
  ],
};

/** The obstacle avoider's course: boxes between the start on the left and the goal on the right. */
export const AVOIDER_COURSE: WorldSpec = {
  version: 1,
  arena: { w: 2.4, h: 1.6 },
  obstacles: [
    { id: "box-1", x: 0.75, y: 0.8, w: 0.12, h: 0.5, angle: 0 },
    { id: "box-2", x: 1.2, y: 0.25, w: 0.3, h: 0.12, angle: 0.3 },
    { id: "box-3", x: 1.25, y: 1.3, w: 0.25, h: 0.15, angle: -0.2 },
    { id: "box-4", x: 1.6, y: 0.75, w: 0.15, h: 0.15, angle: 0.785 },
    { id: "box-5", x: 0.4, y: 1.35, w: 0.2, h: 0.1, angle: 0 },
    { id: "box-6", x: 1.95, y: 1.2, w: 0.1, h: 0.3, angle: 0 },
  ],
  line: null,
  start: { x: 0.25, y: 0.8, heading: 0 },
  checkpoints: [{ x: 2.15, y: 0.4, r: 0.25 }],
};

/** An empty 2 m by 1.5 m arena, for a robot without a course. */
export function emptyWorld(): WorldSpec {
  return {
    version: 1,
    arena: { w: 2, h: 1.5 },
    obstacles: [],
    line: null,
    start: { x: 0.3, y: 0.75, heading: 0 },
    checkpoints: [],
  };
}

/** Read `world.json`, or null if it isn't a world Kiungo can use. */
export function parseWorld(input: string): WorldSpec | null {
  try {
    const raw = JSON.parse(input) as Partial<WorldSpec>;
    if (
      raw.version !== 1 ||
      !raw.arena ||
      typeof raw.arena.w !== "number" ||
      typeof raw.arena.h !== "number" ||
      !raw.start
    )
      return null;
    const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    return {
      version: 1,
      arena: {
        w: Math.max(0.5, Math.min(10, raw.arena.w)),
        h: Math.max(0.5, Math.min(10, raw.arena.h)),
      },
      obstacles: (Array.isArray(raw.obstacles) ? raw.obstacles : []).slice(0, 200).map((o, i) => ({
        id: typeof o?.id === "string" ? o.id.slice(0, 40) : `box-${i + 1}`,
        x: num(o?.x),
        y: num(o?.y),
        w: Math.max(0.01, num(o?.w, 0.1)),
        h: Math.max(0.01, num(o?.h, 0.1)),
        angle: num(o?.angle),
      })),
      line:
        raw.line && Array.isArray(raw.line.points)
          ? {
              points: raw.line.points
                .filter(
                  (p): p is [number, number] =>
                    Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"),
                )
                .slice(0, 2000),
              width: Math.max(0.005, num(raw.line.width, 0.019)),
              closed: raw.line.closed === true,
            }
          : null,
      start: {
        x: num(raw.start.x, 0.3),
        y: num(raw.start.y, 0.3),
        heading: num(raw.start.heading),
      },
      checkpoints: (Array.isArray(raw.checkpoints) ? raw.checkpoints : [])
        .slice(0, 50)
        .map((c) => ({ x: num(c?.x), y: num(c?.y), r: Math.max(0.02, num(c?.r, 0.15)) })),
    };
  } catch {
    return null;
  }
}

export function serializeWorld(world: WorldSpec): string {
  return `${JSON.stringify(world, null, 2)}\n`;
}
