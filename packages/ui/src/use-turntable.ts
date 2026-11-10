"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Turntable behavior for a CSS 3D scene: slow auto-rotation that pauses
 * under the pointer and off screen, drag to spin and tilt, a capped fling on
 * release, arrow keys, and no motion for people who prefer reduced motion.
 *
 * The scene element receives `--spin` and `--tilt` custom properties and a
 * `data-dragging` attribute while a drag is in progress, and `onTurn` hears
 * every change (a WebGL view redraws from it).
 */
export interface TurntableOptions {
  spin?: number;
  tilt?: number;
  /** Degrees per second while idle. */
  speed?: number;
  minTilt?: number;
  maxTilt?: number;
  /** Elements that must not start a drag when pressed, as a selector. */
  ignore?: string;
  /** Turn the behavior off (for still renders). */
  enabled?: boolean;
  /** Called with the angles whenever they change. */
  onTurn?: (spin: number, tilt: number) => void;
}

export function useTurntable(ref: RefObject<HTMLElement | null>, options: TurntableOptions = {}) {
  const { spin: initialSpin = -20, tilt: initialTilt = 55, speed = 10, minTilt = 14, maxTilt = 82, ignore = '[role="switch"], button, a', enabled = true, onTurn } = options;
  // The latest callback, without restarting the turntable when it changes.
  const turned = useRef(onTurn);
  useEffect(() => {
    turned.current = onTurn;
  }, [onTurn]);

  useEffect(() => {
    const scene = ref.current;
    if (!scene || !enabled) return;

    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = { spin: initialSpin, tilt: initialTilt, velocity: 0, dragging: false, hovering: false, visible: true, resumeAt: 0, lastX: 0, lastY: 0 };
    const samples: Array<{ t: number; spin: number }> = [];
    let frame = 0;
    let last = performance.now();

    const clampTilt = (value: number) => Math.min(maxTilt, Math.max(minTilt, value));
    const paint = () => {
      scene.style.setProperty("--spin", `${state.spin.toFixed(2)}deg`);
      scene.style.setProperty("--tilt", `${state.tilt.toFixed(2)}deg`);
      turned.current?.(state.spin, state.tilt);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state.visible && !state.dragging) {
        if (Math.abs(state.velocity) > 0.02) {
          state.spin += state.velocity * dt * 60;
          state.velocity *= Math.pow(0.9, dt * 60);
          paint();
        } else if (!reduce && !state.hovering && now >= state.resumeAt) {
          state.spin += speed * dt;
          paint();
        }
      }
      frame = window.requestAnimationFrame(tick);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (ignore && event.target instanceof Element && event.target.closest(ignore)) return;
      state.dragging = true;
      state.velocity = 0;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      samples.length = 0;
      samples.push({ t: performance.now(), spin: state.spin });
      scene.setPointerCapture?.(event.pointerId);
      scene.dataset.dragging = "";
    };
    const onMove = (event: PointerEvent) => {
      if (!state.dragging) return;
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.spin += dx * 0.45;
      state.tilt = clampTilt(state.tilt - dy * 0.3);
      const now = performance.now();
      samples.push({ t: now, spin: state.spin });
      while (samples.length > 1 && now - samples[0].t > 90) samples.shift();
      paint();
    };
    const onUp = () => {
      if (!state.dragging) return;
      state.dragging = false;
      delete scene.dataset.dragging;
      const now = performance.now();
      state.resumeAt = now + 2200;
      const oldest = samples[0];
      const elapsed = oldest ? now - oldest.t : 0;
      const perFrame = oldest && elapsed > 16 && now - samples[samples.length - 1].t < 80 ? ((state.spin - oldest.spin) / elapsed) * 16.7 : 0;
      state.velocity = reduce ? 0 : Math.max(-14, Math.min(14, perFrame));
      samples.length = 0;
    };
    const onEnter = () => {
      state.hovering = true;
    };
    const onLeave = () => {
      state.hovering = false;
      state.resumeAt = performance.now() + 600;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.target !== scene) return;
      const step = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
      if (!step) return;
      event.preventDefault();
      state.spin += step[0];
      state.tilt = clampTilt(state.tilt + step[1]);
      state.resumeAt = performance.now() + 2200;
      paint();
    };

    const visibility =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            state.visible = entry.isIntersecting;
            last = performance.now();
          })
        : null;
    visibility?.observe(scene);

    paint();
    frame = window.requestAnimationFrame(tick);
    scene.addEventListener("pointerenter", onEnter);
    scene.addEventListener("pointerleave", onLeave);
    scene.addEventListener("pointerdown", onDown);
    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerup", onUp);
    scene.addEventListener("pointercancel", onUp);
    scene.addEventListener("lostpointercapture", onUp);
    scene.addEventListener("keydown", onKey);

    return () => {
      window.cancelAnimationFrame(frame);
      visibility?.disconnect();
      scene.removeEventListener("pointerenter", onEnter);
      scene.removeEventListener("pointerleave", onLeave);
      scene.removeEventListener("pointerdown", onDown);
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerup", onUp);
      scene.removeEventListener("pointercancel", onUp);
      scene.removeEventListener("lostpointercapture", onUp);
      scene.removeEventListener("keydown", onKey);
    };
  }, [ref, initialSpin, initialTilt, speed, minTilt, maxTilt, ignore, enabled]);
}
