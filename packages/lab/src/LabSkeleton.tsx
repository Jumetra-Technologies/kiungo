import { KiungoMark } from "@kiungo/ui/KiungoMark";
import { Skeleton, SkeletonRegion } from "@kiungo/ui/skeleton";

/**
 * The Engineering Lab's shape while it loads: top bar, a full-width canvas
 * with two part cards and a wire, and the dock. The side panels start
 * closed, so the skeleton has none either.
 */
export function LabSkeleton() {
  return (
    <SkeletonRegion label="Loading the Engineering Lab" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <Skeleton className="size-9 rounded-[10px]" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="hidden h-6 w-28 rounded-full sm:block" />
        <Skeleton className="mx-auto h-9 w-[19rem] rounded-[12px]" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="hidden h-9 w-28 md:block" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" style={{ backgroundImage: "radial-gradient(var(--canvas-grid) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
          <div className="absolute left-[12%] top-[16%] w-[300px] max-w-[42%] rounded-[14px] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-3 h-44 w-full rounded-[10px]" />
          </div>
          <div className="absolute left-[58%] top-[30%] w-[230px] max-w-[34%] rounded-[14px] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-24 w-full rounded-[10px]" />
          </div>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d="M 42 34 C 50 34, 50 42, 58 42" fill="none" stroke="var(--border)" strokeWidth="3" strokeDasharray="6 8" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="absolute inset-x-0 bottom-[14%] flex justify-center">
            <div className="rounded-[16px] border border-border bg-surface/90 px-6 py-4 shadow-[var(--shadow-md)] backdrop-blur">
              {/* The region above already announces "Loading"; this is the visible part. */}
              <div className="flex flex-col items-center gap-2.5" aria-hidden>
                <KiungoMark state="loading" className="size-12" />
                <span className="text-[13px] font-medium text-muted">Setting up the lab…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border bg-surface px-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
    </SkeletonRegion>
  );
}
