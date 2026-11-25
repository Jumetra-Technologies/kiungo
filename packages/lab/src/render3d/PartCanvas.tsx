"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { View3D } from "@kiungo/core/parts/geometry";
import type { PartModel } from "@kiungo/core/parts/types";
import { renderPart, webglAvailable } from "./renderer";

const noSubscribe = () => () => undefined;
const serverUnknown = () => null;

/**
 * A part drawn by the shared WebGL renderer into a canvas that fills its
 * parent. It redraws when the part, its size, the view or what's lit changes,
 * and runs while a powered part has moving pieces (and is on screen).
 * Without WebGL it shows `fallback` instead.
 */
export function PartCanvas({
  model,
  view,
  scale,
  powered = false,
  lit,
  shadow = true,
  fallback = null,
  className,
  style,
  onDraw,
}: {
  model: PartModel;
  view: View3D;
  /** Pixels per mm, or a function of the canvas size. */
  scale: number | ((width: number, height: number) => number);
  powered?: boolean;
  lit?: readonly string[];
  shadow?: boolean;
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Told after each draw: the scale used. */
  onDraw?: (scale: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Whether WebGL works here: unknown (null) while rendering on the server.
  const supported = useSyncExternalStore(noSubscribe, webglAvailable, serverUnknown);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const visible = useRef(true);
  const litKey = (lit ?? []).join("|");


  // Size: the canvas fills its parent.
  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el) return;
    const measure = () => setSize((cur) => (cur && cur.w === el.clientWidth && cur.h === el.clientHeight ? cur : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible.current = entry.isIntersecting;
          })
        : null;
    io?.observe(el);
    return () => {
      observer.disconnect();
      io?.disconnect();
    };
  }, [supported]);

  const draw = useCallback(
    (time = 0) => {
      const el = canvas.current;
      if (!el || !size || size.w < 2 || size.h < 2) return;
      const s = typeof scale === "function" ? scale(size.w, size.h) : scale;
      renderPart(model, el, { width: size.w, height: size.h, scale: s, view, powered, lit: litKey ? litKey.split("|") : [], time, shadow });
      onDraw?.(s);
    },
    [model, size, scale, view, powered, litKey, shadow, onDraw],
  );

  useEffect(() => {
    if (!supported) return;
    draw(performance.now() / 1000);
  }, [supported, draw]);

  // Moving parts (a motor shaft, a servo horn) keep moving while powered.
  const moves = powered && ((model.animate?.spin?.length ?? 0) > 0 || (model.animate?.sweep?.length ?? 0) > 0);
  useEffect(() => {
    if (!supported || !moves) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      // About 30 frames a second is smooth enough for a turning shaft.
      if (visible.current && now - last > 32) {
        last = now;
        draw(now / 1000);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [supported, moves, draw]);

  if (supported === false) return <>{fallback}</>;
  return <canvas ref={canvas} className={className} style={{ width: "100%", height: "100%", display: "block", ...style }} aria-hidden />;
}
