"use client";

import { useMemo } from "react";
import { flatColor } from "@kiungo/core/parts/build";
import type { PartModel, Solid } from "@kiungo/core/parts/types";
import { cn } from "@kiungo/ui/cn";
import { thumbImage } from "../render3d/renderer";
import { useInBrowser } from "./PartPlanView";

/**
 * A small picture of a part, for lists: the WebGL render at a three-quarter
 * angle, or a flat top-down silhouette where WebGL isn't available (and
 * while the render is being made).
 */
export function PartThumb({ model, className }: { model: PartModel; className?: string }) {
  const browser = useInBrowser();
  const src = useMemo(() => {
    if (!browser) return null;
    try {
      return thumbImage(model);
    } catch {
      return null;
    }
  }, [browser, model]);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL made in the browser; next/image can't optimize it
    return <img src={src} alt="" aria-hidden className={cn("rounded-[8px] bg-muted-bg object-contain ring-1 ring-inset ring-border/60", className)} draggable={false} data-testid="part-thumb-render" />;
  }

  const { w, h } = model.size;
  const pad = Math.max(w, h) * 0.08;
  const side = Math.max(w, h) + pad * 2;
  const ox = (side - w) / 2;
  const oy = (side - h) / 2;
  // Bodies, plus printed paths: a breadboard's holes and rail stripes are paths, and without them it is a blank slab.
  const shapes = model.solids.filter((solid) => solid.kind === "box" || solid.kind === "cyl" || solid.kind === "dome" || solid.kind === "path");
  return (
    <svg viewBox={`${-ox} ${-oy} ${side} ${side}`} className={cn("rounded-[8px] bg-muted-bg ring-1 ring-inset ring-border/60", className)} aria-hidden>
      {shapes.map((solid: Solid, i) => {
        if (solid.kind === "box") {
          return <rect key={i} x={solid.x} y={solid.y} width={solid.w} height={solid.h} rx={solid.radius ?? 0.3} fill={solid.fill ?? flatColor(solid.top)} />;
        }
        if (solid.kind === "cyl") {
          return <circle key={i} cx={solid.cx} cy={solid.cy} r={solid.r} fill={solid.fill ?? flatColor(solid.top)} />;
        }
        if (solid.kind === "path") {
          return <path key={i} d={solid.d} fill={solid.fill ?? "none"} stroke={solid.color ?? "none"} strokeWidth={Math.max(solid.width ?? 0.3, 0.5)} strokeLinecap="round" />;
        }
        if (solid.kind === "dome") {
          return <circle key={i} cx={solid.cx} cy={solid.cy} r={solid.r} fill={solid.color} />;
        }
        return null;
      })}
    </svg>
  );
}
