import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Download, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@kiungo/ui/button";
import { cn } from "@kiungo/ui/cn";
import type { UpdateControls } from "./useUpdate";

/**
 * Kiungo's own update, as a Kiungo-blue card in the bottom-left corner (the
 * pop-up notice style, .hhip-notice in @kiungo/ui's theme.css). It appears the
 * moment a new version is found and follows the download; once the version
 * is ready, the card itself is the button: one click saves every project,
 * installs, and reopens Kiungo on the new version. Later puts that version's
 * card away until the next start (it installs anyway when Kiungo quits).
 *
 * A check the person asked for also reports here (checking, up to date, or
 * what went wrong); checks nobody asked for stay quiet unless they find
 * something.
 */
export function UpdateBanner({ update }: { update: UpdateControls }) {
  const { info, asked, refused, later, install, dismiss, putOff } = update;
  const [restarting, setRestarting] = useState(false);
  const state = info?.state;

  // "You're up to date" goes by itself.
  useEffect(() => {
    if (!asked || state?.status !== "up-to-date") return;
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [asked, state?.status, dismiss]);

  if (!info || !state) return null;

  const frame = (phase: string, children: ReactNode, extra?: ReactNode) => (
    <div role="status" aria-live="polite" data-testid="update-banner" data-phase={phase} className="fixed bottom-4 left-4 z-50 w-[340px] max-w-[calc(100vw-2rem)]">
      {children}
      {extra}
    </div>
  );
  const card = "hhip-notice hhip-notice-in flex w-full gap-3 rounded-[12px] p-3.5 text-left";
  // Buttons on the blue: a quiet one, and a solid white one for the main action.
  const quiet = "border border-white/30 bg-white/10 text-white shadow-none hover:bg-white/20 focus-visible:ring-white/70";
  const close = (
    <Button size="sm" className={quiet} onClick={dismiss} aria-label="Close">
      <X className="size-3.5" aria-hidden />
    </Button>
  );

  // The update is coming: say so, and how far it is.
  if (state.status === "downloading") {
    return frame(
      "downloading",
      <div className={card}>
        <Download className="mt-0.5 size-4 shrink-0 text-[var(--notice-accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-5">Kiungo {state.version} is on its way</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--notice-track)]" role="progressbar" aria-label={`Downloading Kiungo ${state.version}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent}>
            <div className="h-full rounded-full bg-[var(--notice-accent)]" style={{ width: `${state.percent}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] leading-[18px] text-[var(--notice-muted)]" data-testid="update-progress">
            {state.percent}% downloaded. Keep working; it installs when you say.
          </p>
        </div>
      </div>,
    );
  }

  // Ready: the card is the button.
  if (state.status === "ready" && later !== state.version) {
    const detail = restarting ? "Saving your projects, then installing. Kiungo opens again by itself." : (refused ?? "Click to restart and update. Your projects are saved first; it takes a few seconds.");
    return frame(
      "ready",
      <button
        type="button"
        disabled={restarting}
        data-testid="update-restart"
        aria-busy={restarting}
        onClick={() => {
          setRestarting(true);
          void install().then((r) => {
            if (!r.ok) setRestarting(false);
          });
        }}
        className={cn(card, "cursor-pointer pr-14 transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-progress")}
      >
        {restarting ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[var(--notice-accent)]" aria-hidden /> : <RefreshCw className="mt-0.5 size-4 shrink-0 text-[var(--notice-accent)]" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-5">{restarting ? `Restarting to update to Kiungo ${state.version}…` : `Kiungo ${state.version} is ready`}</span>
          <span className={cn("mt-0.5 block text-[12px] leading-[18px]", refused && !restarting ? "text-amber-200" : "text-[var(--notice-muted)]")}>{detail}</span>
        </span>
      </button>,
      restarting ? null : (
        <Button size="sm" onClick={() => putOff(state.version)} className={cn(quiet, "absolute right-2 top-2 h-7 px-2 text-[11.5px]")} data-testid="update-later">
          Later
        </Button>
      ),
    );
  }

  let body: { icon: ReactNode; title: string; detail?: string; actions?: ReactNode } | null = null;
  if (state.status === "error" && (!state.quiet || asked)) {
    body = { icon: <CircleAlert className="size-4 text-[var(--warning)]" aria-hidden />, title: "Update didn't work", detail: state.message, actions: close };
  } else if (asked) {
    if (state.status === "checking" || state.status === "idle") body = { icon: <Loader2 className="size-4 animate-spin text-[var(--notice-muted)]" aria-hidden />, title: "Checking for updates…" };
    else if (state.status === "up-to-date") body = { icon: <CircleCheck className="size-4 text-[var(--notice-accent)]" aria-hidden />, title: `Kiungo ${info.currentVersion} is the newest version`, actions: close };
    else if (state.status === "unsupported")
      body = {
        icon: <CircleAlert className="size-4 text-[var(--notice-muted)]" aria-hidden />,
        title: "Kiungo can't update itself here",
        detail: state.message,
        actions: (
          <>
            {close}
            {state.reason === "platform" ? (
              <a href={state.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[10px] bg-white px-3 text-xs font-medium text-[var(--kiungo-navy)] hover:bg-white/90">
                Open the download page
              </a>
            ) : null}
          </>
        ),
      };
  }
  if (!body) return null;

  return frame(
    state.status,
    <div className={card}>
      <span className="mt-0.5 shrink-0">{body.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-5">{body.title}</p>
        {body.detail ? <p className="mt-0.5 text-[12px] leading-[18px] text-[var(--notice-muted)]">{body.detail}</p> : null}
        {body.actions ? <div className="mt-2.5 flex items-center justify-end gap-1.5">{body.actions}</div> : null}
      </div>
    </div>,
  );
}
