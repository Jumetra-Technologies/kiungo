import type { CircuitThumbnail as Thumbnail, ThumbnailKind } from "@kiungo/core/project";
import { cn } from "@kiungo/ui/cn";

/** Parts drawn by what they are: the board in the brand teal, the rest as outlines. */
const KIND: Record<ThumbnailKind, string> = {
  board: "fill-[color-mix(in_srgb,var(--kiungo-teal)_22%,var(--surface))] stroke-[var(--kiungo-teal)]",
  breadboard: "fill-[color-mix(in_srgb,var(--muted)_10%,var(--surface))] stroke-[color-mix(in_srgb,var(--muted)_60%,transparent)]",
  sensor: "fill-surface stroke-[var(--kiungo-stem)]",
  output: "fill-surface stroke-[var(--kiungo-stem)]",
  display: "fill-[color-mix(in_srgb,var(--kiungo-stem)_12%,var(--surface))] stroke-[var(--kiungo-stem)]",
  radio: "fill-surface stroke-[var(--kiungo-stem)]",
  other: "fill-surface stroke-muted",
};

/** A project's circuit as it sits on the canvas: parts as boxes, wires in amber. */
export function CircuitThumbnail({ thumbnail, className }: { thumbnail: Thumbnail | null; className?: string }) {
  if (!thumbnail || !thumbnail.boxes.length) {
    return <div className={cn("hhip-canvas-grid", className)} aria-hidden />;
  }
  const { width, height } = thumbnail;
  // Stroke widths are in canvas units; keep them about the same on screen whatever the build's size.
  const unit = Math.max(width, height) / 220;
  return (
    <div className={cn("hhip-canvas-grid", className)} aria-hidden>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="size-full p-3">
        {thumbnail.lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--kiungo-amber)" strokeWidth={1.6 * unit} strokeLinecap="round" opacity={0.9} />
        ))}
        {thumbnail.boxes.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={6 * unit} strokeWidth={1.4 * unit} className={KIND[b.kind]} />
        ))}
      </svg>
    </div>
  );
}
