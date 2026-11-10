"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { SIN_TILT, TILT, dropBelow } from "@kiungo/core/parts/geometry";
import type { PartModel } from "@kiungo/core/parts/types";
import { useTurntable } from "@kiungo/ui/use-turntable";
import { cn } from "@kiungo/ui/cn";
import { PartCanvas } from "../render3d/PartCanvas";
import { PartPlanGraphic } from "./PartPlanView";
import styles from "./part-model.module.css";

const MAX_SCALE = 40;

/** Pixels per millimeter so the part, turned to any angle, fits the stage. */
function fitScale(width: number, height: number, model: PartModel): number {
  const diagonal = Math.hypot(model.size.w, model.size.h) || 1;
  const byWidth = (width * 0.9) / diagonal;
  const byHeight = (height * 0.94) / (diagonal * 0.58 + (model.size.d + dropBelow(model)) * SIN_TILT);
  return Math.max(2, Math.min(MAX_SCALE, byWidth, byHeight));
}

/**
 * A part in 3D, drawn with WebGL: real materials, light and shadow. Turns
 * slowly on a turntable you can drag, or holds a still view (the lab's nodes,
 * where `scale` and the orthographic camera put every pin on the pixel the
 * wires expect; see @kiungo/core/parts/geometry). Without WebGL it shows the
 * top view instead.
 */
export function PartModel3D({
  model,
  powered,
  className,
  still,
  lit: litOverride,
  scale: fixedScale,
}: {
  model: PartModel;
  powered: boolean;
  className?: string;
  /** A fixed three-quarter view with no turntable, for small renders such as lab nodes. */
  still?: { spin: number; tilt: number };
  /** Light only these solids (overrides the model's own list while powered). */
  lit?: string[];
  /** Pixels per millimeter, instead of fitting the stage. The lab uses this so it knows where every pin lands. */
  scale?: number;
  /** Kept for callers: every view is now orthographic, as the lab's pin math assumes. */
  flat?: boolean;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState({ spin: -24, tilt: TILT });
  const onTurn = useCallback((spin: number, tilt: number) => setTurn((cur) => (Math.abs(cur.spin - spin) < 0.05 && Math.abs(cur.tilt - tilt) < 0.05 ? cur : { spin, tilt })), []);
  useTurntable(sceneRef, { spin: -24, tilt: TILT, speed: 9, enabled: !still, onTurn });

  const view = useMemo(() => (still ? { spin: still.spin, tilt: still.tilt } : turn), [still, turn]);
  const scale = useMemo(() => fixedScale ?? ((w: number, h: number) => fitScale(w, h, model)), [fixedScale, model]);
  const lit = powered ? (litOverride ?? model.animate?.lit ?? []) : [];

  return (
    <div
      ref={sceneRef}
      className={cn(styles.scene, still && styles.still, className)}
      {...(still
        ? { role: "img", "aria-label": `${model.name}, 3D view` }
        : { role: "group", "aria-roledescription": "interactive 3D model", "aria-label": `${model.name}, turning slowly. Drag or use the arrow keys to turn it.`, tabIndex: 0 })}
      data-testid="part-3d"
      data-powered={powered ? "" : undefined}
      data-lit={lit.join(" ") || undefined}
    >
      <PartCanvas
        model={model}
        view={view}
        scale={scale}
        powered={powered}
        lit={lit}
        className={styles.canvas}
        fallback={<PartPlanGraphic model={model} powered={powered} lit={litOverride} className="h-full w-full" />}
      />
    </div>
  );
}
