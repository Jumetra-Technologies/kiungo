import { cn } from "./cn";

/** A placeholder block with a soft moving sheen, shown while content loads. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("hhip-skeleton rounded-[8px]", className)} style={style} />;
}

/** Wraps skeleton content so assistive tech hears one "Loading" instead of empty boxes. */
export function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
