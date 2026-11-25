import { useState } from "react";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import type { AuthState } from "@kiungo/api";
import { Button } from "@kiungo/ui/button";
import { KiungoMark } from "@kiungo/ui/KiungoMark";
import { invoke } from "../ipc";

/**
 * First run (DSK-01): one screen, one action. No tour, no feature showcase.
 * When signing in can't start (offline, or the service isn't there), a
 * second, quieter choice lets the person use Kiungo anyway.
 */
export function SignInScreen({ state }: { state: Extract<AuthState, { status: "signed-out" | "waiting" }> }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const waiting = state.status === "waiting";

  const start = async () => {
    setBusy(true);
    try {
      await invoke("auth:sign-in");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (state.status !== "waiting") return;
    await navigator.clipboard.writeText(state.signInUrl).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex h-full items-center justify-center bg-background px-6 text-foreground" data-testid="sign-in-screen">
      <div className="w-full max-w-[400px] text-center">
        <KiungoMark state={waiting ? "loading" : "still"} className="mx-auto size-14" />
        <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.02em]">{waiting ? "Finish in your browser" : "Sign in to Kiungo"}</h1>
        <p className="mx-auto mt-2 max-w-[340px] text-[14.5px] leading-6 text-muted">
          {waiting ? "Sign in on the Kiungo page that opened, then come back here. This window carries on by itself." : "Your browser opens to sign in with Google or GitHub, then brings you back here."}
        </p>

        {state.status === "signed-out" && state.message ? (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3.5 py-2.5 text-left text-[13px] leading-5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {state.message}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col items-center gap-3">
          {waiting ? (
            <>
              <Button variant="secondary" onClick={() => void invoke("auth:cancel")} data-testid="cancel-sign-in">
                Cancel
              </Button>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground">
                <Copy className="size-3.5" aria-hidden />
                {copied ? "Link copied" : "Browser didn't open? Copy the sign-in link"}
              </button>
            </>
          ) : (
            <Button size="lg" onClick={start} disabled={busy} className="min-w-[240px]" data-testid="sign-in">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Sign in with your browser
            </Button>
          )}
          {state.status === "signed-out" && state.canSkip ? (
            <button type="button" onClick={() => void invoke("auth:skip")} className="text-[13px] font-medium text-primary hover:underline" data-testid="skip-sign-in">
              Use Kiungo without signing in
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
