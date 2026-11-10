import { useCallback, useEffect, useMemo, useState } from "react";
import type { UpdateInfo, UpdateInstallResult } from "@kiungo/api";
import { invoke } from "../ipc";

export interface UpdateControls {
  info: UpdateInfo | null;
  /** The person asked for this check: show how it ends, even when there's nothing new. */
  asked: boolean;
  /** Why the last Restart to update had to wait ("Stop the run on your board first…"). */
  refused: string | null;
  /** The ready version the person put off with Later: its card stays hidden. */
  later: string | null;
  check: () => void;
  install: () => Promise<UpdateInstallResult>;
  dismiss: () => void;
  putOff: (version: string) => void;
}

/** Kiungo's own update, kept current by the main process. */
export function useUpdate(): UpdateControls {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [asked, setAsked] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [later, setLater] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const stop = window.kiungo.on("update:changed", (next) => live && setInfo(next));
    void invoke("update:status").then((s) => live && setInfo((cur) => cur ?? s));
    return () => {
      live = false;
      stop();
    };
  }, []);
  const check = useCallback(() => {
    setAsked(true);
    void invoke("update:check").then(setInfo);
  }, []);
  const install = useCallback(async () => {
    setLater(null);
    const result = await invoke("update:install");
    setRefused(result.ok ? null : result.message);
    return result;
  }, []);
  const dismiss = useCallback(() => setAsked(false), []);
  const putOff = useCallback((version: string) => {
    setLater(version);
    setRefused(null);
    setAsked(false);
  }, []);
  return useMemo(() => ({ info, asked, refused, later, check, install, dismiss, putOff }), [info, asked, refused, later, check, install, dismiss, putOff]);
}
