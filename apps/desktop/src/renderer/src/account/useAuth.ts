import { useEffect, useState } from "react";
import type { AuthState } from "@kiungo/api";
import { invoke } from "../ipc";

/** The sign-in state, kept current by the main process; null until it answers. */
export function useAuth(): AuthState | null {
  const [state, setState] = useState<AuthState | null>(null);
  useEffect(() => {
    let live = true;
    const stop = window.kiungo.on("auth:changed", (next) => live && setState(next));
    void invoke("auth:state").then((s) => live && setState((cur) => cur ?? s));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return state;
}
