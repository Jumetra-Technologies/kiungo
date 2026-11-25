import { cn } from "./cn";
import styles from "./kiungo.module.css";

/**
 * The Kiungo mark, redrawn as vector from the logo. Its parts are kept
 * separate so they can move on their own:
 *
 * - beads: the beadwork column on the left (five pieces)
 * - stem: the navy upright of the K, the hardware
 * - arms: the teal arms and the link they meet in
 * - link: the two interlocking links (the C in the stem and the slot in the
 *   arms): "kiungo" is Swahili for link or joint
 * - traces and nodes: the circuit traces running out to the amber pads
 *
 * Colors come from CSS variables (--kiungo-navy, --kiungo-teal,
 * --kiungo-amber, --kiungo-cut) so the mark follows the theme.
 */
export type KiungoMarkState = "still" | "loading" | "broken";

export function KiungoMark({ state = "still", className, title }: { state?: KiungoMarkState; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn(styles.mark, state === "loading" && styles.loading, state === "broken" && styles.broken, className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-state={state}
    >
      <g className={styles.beads}>
        <g className={styles.bead}>
          <polygon points="13.5,17 13.5,26 5,21.5" />
          <circle cx="10.6" cy="21.5" r="1.1" className={styles.cutFill} />
        </g>
        <polygon className={styles.bead} points="3.5,28 14,34 3.5,40" />
        <polygon className={styles.bead} points="14,42 3.5,48 14,54" />
        <polygon className={styles.bead} points="3.5,56 14,62 3.5,68" />
        <g className={styles.bead}>
          <polygon points="13.5,70 13.5,79 5,74.5" />
          <circle cx="10.6" cy="74.5" r="1.1" className={styles.cutFill} />
        </g>
      </g>

      <g className={styles.stemSide}>
        <rect className={styles.stem} x="17" y="5" width="24" height="90" rx="3.2" />
        {/* The first link: a C cut into the stem. */}
        <path className={styles.cut} d="M47 38.5 H30.5 A11.5 11.5 0 0 0 30.5 61.5 H47" strokeWidth="3" />
      </g>

      <g className={styles.armSide}>
        <g className={styles.arms}>
          <polygon points="63,5 96,5 61,39.5 41,39.5" />
          <polygon points="41,60.5 61,60.5 96,95 63,95" />
          <rect x="40" y="38" width="54" height="24" rx="12" />
        </g>
        {/* The second link: a slot through the arms, interlocking with the first. */}
        <rect className={styles.slot} x="36.5" y="44.2" width="49" height="11.6" rx="5.8" strokeWidth="2.6" />
        <rect className={styles.pulse} x="36.5" y="44.2" width="49" height="11.6" rx="5.8" pathLength={100} strokeWidth="2.6" />
        <path className={cn(styles.cut, styles.trace)} d="M49 44.2 H55 L72.5 19" strokeWidth="2.2" pathLength={100} />
        <path className={cn(styles.cut, styles.trace, styles.traceLow)} d="M49 55.8 H55 L72.5 81" strokeWidth="2.2" pathLength={100} />
        <g className={styles.node}>
          <circle cx="75" cy="15" r="4.9" className={styles.cutFill} />
          <circle cx="75" cy="15" r="3.3" className={styles.pad} />
        </g>
        <g className={cn(styles.node, styles.nodeLow)}>
          <circle cx="75" cy="85" r="4.9" className={styles.cutFill} />
          <circle cx="75" cy="85" r="3.3" className={styles.pad} />
        </g>
      </g>
    </svg>
  );
}

/**
 * Mark and name together. `variant="full"` adds "Labs Technologies" under
 * the name, as on the logo; "compact" is the name alone.
 */
export function KiungoLogo({ variant = "compact", className, markClassName }: { variant?: "compact" | "full"; className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <KiungoMark className={cn("size-7 shrink-0", markClassName)} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={styles.word}>Kiungo</span>
        {variant === "full" ? <span className={styles.sub}>Labs Technologies</span> : null}
      </span>
    </span>
  );
}

/**
 * The loading state, made from the mark: traces draw out to the pads, the
 * pads light, a pulse runs round the link, and the beads fill like a
 * progress bar. Still (with a soft fade) for people who prefer less motion.
 */
export function KiungoLoader({ label = "Loading", size = "md", className, showLabel = true }: { label?: string; size?: "sm" | "md" | "lg"; className?: string; showLabel?: boolean }) {
  const dim = size === "sm" ? "size-8" : size === "lg" ? "size-20" : "size-12";
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center gap-3", className)} data-testid="kiungo-loader">
      <KiungoMark state="loading" className={dim} />
      {showLabel ? <span className="text-[13px] font-medium text-muted">{label}…</span> : <span className="sr-only">{label}</span>}
    </div>
  );
}
