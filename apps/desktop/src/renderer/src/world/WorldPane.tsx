import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bot, Flag, Plus, RotateCw, Trash2 } from "lucide-react";
import { CHASSIS } from "@kiungo/core/world/robot";
import { emptyWorld } from "@kiungo/core/world/courses";
import { toWorld } from "@kiungo/core/world/sim";
import type { Pose, RobotSpec, WorldObstacle, WorldSpec, WorldState } from "@kiungo/core/world/types";
import { cn } from "@kiungo/ui/cn";

/** The world's state from the running program, outside React's render loop: only this pane redraws 20 times a second. */
export function createWorldFeed() {
  let current: { state: WorldState | null; robot: RobotSpec | null } = { state: null, robot: null };
  const listeners = new Set<() => void>();
  return {
    push(state: WorldState | null, robot: RobotSpec | null) {
      current = { state, robot };
      for (const l of listeners) l();
    },
    get: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type WorldFeed = ReturnType<typeof createWorldFeed>;

interface WorldPaneProps {
  world: WorldSpec | null;
  feed: WorldFeed;
  running: boolean;
  /** Obstacles moved, added or removed: save, and tell the running robot. */
  onChange: (world: WorldSpec) => void;
}

/** Colors from the theme, read once per theme change. */
function palette(el: HTMLElement) {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { floor: v("--surface", "#fff"), grid: v("--border", "#e5e7eb"), text: v("--muted", "#64748b"), fg: v("--foreground", "#0f172a"), primary: v("--primary", "#0f766e"), danger: v("--danger", "#dc2626"), success: v("--success", "#16a34a"), warning: v("--warning", "#d97706"), box: v("--muted-bg", "#e2e8f0") };
}

const TRAIL = 240;

/**
 * The robot in its world (WLD-01, OUT-03): the arena from above, the robot
 * as the program drives it, what its sensors see, and obstacles you can drag
 * while it runs. Drawn at the screen's frame rate, between the readings.
 */
export function WorldPane({ world, feed, running, onChange }: WorldPaneProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { state, robot } = useSyncExternalStore(feed.subscribe, feed.get);
  const [selected, setSelected] = useState<string | null>(null);
  const spec = world ?? null;
  const live = useRef({ spec, state, robot, selected, prev: null as { pose: Pose; at: number } | null, next: null as { pose: Pose; at: number } | null, trail: [] as Array<[number, number]> });

  // Keep what the drawing loop reads current, and the robot's last two poses for smooth motion between readings.
  useEffect(() => {
    const l = live.current;
    l.spec = spec;
    l.robot = robot;
    l.selected = selected;
    if (state && state !== l.state) {
      const now = performance.now();
      l.prev = l.next ?? { pose: state.robot, at: now };
      l.next = { pose: state.robot, at: now };
      l.trail.push([state.robot.x, state.robot.y]);
      if (l.trail.length > TRAIL) l.trail.shift();
    }
    if (!state) {
      l.prev = l.next = null;
      l.trail = [];
    }
    l.state = state;
  }, [spec, state, robot, selected]);

  // The view: the arena fitted to the pane, y up.
  const view = useCallback(() => {
    const c = canvas.current;
    const s = live.current.spec;
    if (!c || !s) return null;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const margin = 24;
    const scale = Math.min((w - margin * 2) / s.arena.w, (h - margin * 2) / s.arena.h);
    const ox = (w - s.arena.w * scale) / 2;
    const oy = (h + s.arena.h * scale) / 2;
    return { scale, toScreen: (x: number, y: number): [number, number] => [ox + x * scale, oy - y * scale], toWorld: (px: number, py: number): [number, number] => [(px - ox) / scale, (oy - py) / scale] };
  }, []);

  // Draw every frame.
  useEffect(() => {
    let frame = 0;
    let colors = canvas.current ? palette(canvas.current) : null;
    const theme = new MutationObserver(() => canvas.current && (colors = palette(canvas.current)));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const c = canvas.current;
      const v = view();
      const l = live.current;
      if (!c || !v || !l.spec || !colors) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(c.clientWidth * dpr) || c.height !== Math.round(c.clientHeight * dpr)) {
        c.width = Math.round(c.clientWidth * dpr);
        c.height = Math.round(c.clientHeight * dpr);
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, c.clientWidth, c.clientHeight);
      const s = l.spec;
      const [ax, ay] = v.toScreen(0, s.arena.h);
      // Floor and a 10 cm grid.
      g.fillStyle = colors.floor;
      g.fillRect(ax, ay, s.arena.w * v.scale, s.arena.h * v.scale);
      g.strokeStyle = colors.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0.1; x < s.arena.w; x += 0.1) {
        const [px] = v.toScreen(x, 0);
        g.moveTo(px, ay);
        g.lineTo(px, ay + s.arena.h * v.scale);
      }
      for (let y = 0.1; y < s.arena.h; y += 0.1) {
        const [, py] = v.toScreen(0, y);
        g.moveTo(ax, py);
        g.lineTo(ax + s.arena.w * v.scale, py);
      }
      g.stroke();
      g.strokeStyle = colors.fg;
      g.lineWidth = 2;
      g.strokeRect(ax, ay, s.arena.w * v.scale, s.arena.h * v.scale);
      // The line on the floor.
      if (s.line && s.line.points.length > 1) {
        g.strokeStyle = "#111827";
        g.lineWidth = Math.max(2, s.line.width * v.scale);
        g.lineJoin = "round";
        g.beginPath();
        s.line.points.forEach(([x, y], i) => (i ? g.lineTo(...v.toScreen(x, y)) : g.moveTo(...v.toScreen(x, y))));
        if (s.line.closed) g.closePath();
        g.stroke();
      }
      // Checkpoints, in order.
      const passed = l.state?.checkpoints ?? 0;
      s.checkpoints.forEach((cp, i) => {
        const [px, py] = v.toScreen(cp.x, cp.y);
        g.beginPath();
        g.arc(px, py, cp.r * v.scale, 0, Math.PI * 2);
        g.setLineDash([4, 4]);
        g.strokeStyle = i < passed ? colors!.success : colors!.text;
        g.lineWidth = 1.5;
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = i < passed ? colors!.success : colors!.text;
        g.font = "600 11px Inter, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(i === s.checkpoints.length - 1 ? "Finish" : String(i + 1), px, py);
      });
      // Obstacles.
      for (const o of s.obstacles) {
        const [px, py] = v.toScreen(o.x, o.y);
        g.save();
        g.translate(px, py);
        g.rotate(-o.angle);
        g.fillStyle = colors.box;
        g.strokeStyle = o.id === l.selected ? colors.primary : colors.fg;
        g.lineWidth = o.id === l.selected ? 2.5 : 1.25;
        g.fillRect((-o.w / 2) * v.scale, (-o.h / 2) * v.scale, o.w * v.scale, o.h * v.scale);
        g.strokeRect((-o.w / 2) * v.scale, (-o.h / 2) * v.scale, o.w * v.scale, o.h * v.scale);
        g.restore();
      }
      // The trail.
      if (l.trail.length > 1) {
        g.strokeStyle = colors.primary;
        g.globalAlpha = 0.35;
        g.lineWidth = 2;
        g.beginPath();
        l.trail.forEach(([x, y], i) => (i ? g.lineTo(...v.toScreen(x, y)) : g.moveTo(...v.toScreen(x, y))));
        g.stroke();
        g.globalAlpha = 1;
      }
      // The robot: between its last two readings, so it moves smoothly at the screen's rate.
      let pose: Pose = s.start;
      if (l.next && l.prev) {
        const k = Math.min(1, (performance.now() - l.next.at) / 50);
        const a = l.prev.pose;
        const b = l.next.pose;
        let dh = b.heading - a.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        pose = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, heading: a.heading + dh * k };
      }
      const r = l.robot ?? { ...CHASSIS, motors: { left: "", right: "" }, sensors: [] };
      // What the sensors see.
      for (const sensor of r.sensors) {
        const seen = l.state?.sensors[sensor.nodeId];
        const [sx, sy] = toWorld(pose, sensor.pose);
        if (sensor.kind === "distance") {
          const hit = seen?.hit;
          const end: [number, number] = hit ?? [sx + Math.cos(pose.heading) * 0.6, sy + Math.sin(pose.heading) * 0.6];
          g.strokeStyle = hit ? colors.warning : colors.text;
          g.globalAlpha = hit ? 0.9 : 0.3;
          g.setLineDash([3, 3]);
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(...v.toScreen(sx, sy));
          g.lineTo(...v.toScreen(end[0], end[1]));
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
          if (hit) {
            g.fillStyle = colors.warning;
            g.beginPath();
            g.arc(...v.toScreen(hit[0], hit[1]), 3.5, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      const [rx, ry] = v.toScreen(pose.x, pose.y);
      g.save();
      g.translate(rx, ry);
      g.rotate(-pose.heading);
      const L = r.length * v.scale;
      const W = r.width * v.scale;
      // Wheels.
      g.fillStyle = "#1f2937";
      const ww = r.wheelRadius * 2 * v.scale;
      const wt = Math.max(3, 0.026 * v.scale);
      for (const side of [-1, 1]) g.fillRect(-ww / 2, side * (r.track / 2) * v.scale - wt / 2, ww, wt);
      // Chassis.
      g.fillStyle = l.state?.touching ? colors.danger : colors.primary;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.roundRect(-L / 2, -W / 2, L, W, 4);
      g.fill();
      g.globalAlpha = 1;
      // Front arrow.
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(L / 2 - 4, 0);
      g.lineTo(L / 2 - 14, -6);
      g.lineTo(L / 2 - 14, 6);
      g.closePath();
      g.fill();
      g.restore();
      // Floor sensors, on top: filled when they see the tape.
      for (const sensor of r.sensors) {
        if (sensor.kind !== "floor") continue;
        const [sx, sy] = toWorld(pose, sensor.pose);
        const dark = l.state?.sensors[sensor.nodeId]?.dark;
        g.beginPath();
        g.arc(...v.toScreen(sx, sy), 4, 0, Math.PI * 2);
        g.fillStyle = dark ? colors.warning : "#fff";
        g.strokeStyle = colors.fg;
        g.lineWidth = 1;
        g.fill();
        g.stroke();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      theme.disconnect();
    };
  }, [view]);

  // Dragging obstacles: they move under the pointer; the running robot sees them move.
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const hitObstacle = (wx: number, wy: number): WorldObstacle | undefined =>
    [...(spec?.obstacles ?? [])].reverse().find((o) => {
      const c = Math.cos(-o.angle);
      const s = Math.sin(-o.angle);
      const lx = (wx - o.x) * c - (wy - o.y) * s;
      const ly = (wx - o.x) * s + (wy - o.y) * c;
      return Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2;
    });
  const pointer = (e: React.PointerEvent) => {
    const v = view();
    const rect = canvas.current?.getBoundingClientRect();
    if (!v || !rect) return null;
    return v.toWorld(e.clientX - rect.left, e.clientY - rect.top);
  };
  const lastSent = useRef(0);
  const moveObstacle = (id: string, x: number, y: number, save: boolean) => {
    if (!spec) return;
    const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
    const next = { ...spec, obstacles: spec.obstacles.map((o) => (o.id === id ? { ...o, x: clamp(x, spec.arena.w), y: clamp(y, spec.arena.h) } : o)) };
    const now = performance.now();
    if (save || now - lastSent.current > 50) {
      lastSent.current = now;
      onChange(next);
    } else live.current.spec = next;
  };

  const update = (obstacles: WorldObstacle[]) => spec && onChange({ ...spec, obstacles });
  const add = () => {
    if (!spec) return;
    const id = `box-${Date.now().toString(36)}`;
    update([...spec.obstacles, { id, x: spec.arena.w / 2, y: spec.arena.h / 2, w: 0.15, h: 0.15, angle: 0 }]);
    setSelected(id);
  };
  const rotate = () => spec && selected && update(spec.obstacles.map((o) => (o.id === selected ? { ...o, angle: o.angle + Math.PI / 12 } : o)));
  const remove = () => {
    if (!spec || !selected) return;
    update(spec.obstacles.filter((o) => o.id !== selected));
    setSelected(null);
  };

  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" data-testid="world-empty">
        <Bot className="size-8 text-muted" aria-hidden />
        <p className="max-w-[340px] text-[13px] text-muted">A robot drives here when its board has two DC motors as wheels. Add a world to drive it in: an arena you can put obstacles in.</p>
        <button type="button" onClick={() => onChange(emptyWorld())} className="h-8 rounded-[8px] bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90" data-testid="world-add">
          Add a world
        </button>
      </div>
    );
  }

  const finished = state?.finished;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="world-pane">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <button type="button" onClick={add} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-medium hover:bg-muted-bg" data-testid="world-add-box">
          <Plus className="size-3.5" aria-hidden />
          Box
        </button>
        <button type="button" onClick={rotate} disabled={!selected} aria-label="Turn the box" title="Turn the box 15°" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground disabled:opacity-40">
          <RotateCw className="size-4" />
        </button>
        <button type="button" onClick={remove} disabled={!selected} aria-label="Remove the box" title="Remove the box" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-danger disabled:opacity-40">
          <Trash2 className="size-4" />
        </button>
        <span className="flex-1" />
        <span className="flex items-center gap-3 text-[11.5px] tabular-nums text-muted" aria-live="polite" data-testid="world-stats">
          {state ? (
            <>
              <span>{state.t.toFixed(1)} s</span>
              <span>{(Math.abs(state.speed) * 100).toFixed(0)} cm/s</span>
              <span>{state.odometer.toFixed(2)} m</span>
              <span className={cn(state.collisions && "text-danger")}>{state.collisions === 1 ? "1 bump" : `${state.collisions} bumps`}</span>
              {spec.checkpoints.length ? (
                <span className={cn("inline-flex items-center gap-1", finished && "font-medium text-success")}>
                  <Flag className="size-3.5" aria-hidden />
                  {finished ? "Finished" : `${state.checkpoints} of ${spec.checkpoints.length}`}
                </span>
              ) : null}
            </>
          ) : running ? (
            "Starting…"
          ) : (
            "Press Run: the robot drives as your code says"
          )}
        </span>
      </div>
      <div ref={wrap} className="relative min-h-0 flex-1">
        <canvas
          ref={canvas}
          className="absolute inset-0 size-full touch-none"
          role="img"
          aria-label={`The robot's world: ${spec.arena.w} m by ${spec.arena.h} m, ${spec.obstacles.length} obstacles${spec.line ? ", a line on the floor" : ""}. Drag a box to move it.`}
          data-testid="world-canvas"
          onPointerDown={(e) => {
            const at = pointer(e);
            if (!at) return;
            const hit = hitObstacle(at[0], at[1]);
            setSelected(hit?.id ?? null);
            if (hit) {
              drag.current = { id: hit.id, dx: at[0] - hit.x, dy: at[1] - hit.y, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const at = pointer(e);
            if (!d || !at) return;
            d.moved = true;
            moveObstacle(d.id, at[0] - d.dx, at[1] - d.dy, false);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            const at = pointer(e);
            drag.current = null;
            if (d?.moved && at) moveObstacle(d.id, at[0] - d.dx, at[1] - d.dy, true);
          }}
        />
      </div>
    </div>
  );
}
