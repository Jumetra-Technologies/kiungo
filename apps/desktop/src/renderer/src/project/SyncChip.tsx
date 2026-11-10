import { useEffect, useState } from "react";
import { AlertTriangle, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import type { SyncStatus } from "@kiungo/api";
import { cn } from "@kiungo/ui/cn";
import { invoke } from "../ipc";

const LABEL: Record<SyncStatus["state"], string> = {
  off: "",
  syncing: "Syncing",
  synced: "Synced",
  behind: "Newer copy online",
  conflict: "Synced, with a conflict",
  offline: "Offline",
  "signed-out": "Not syncing",
  removed: "Not on your account",
  error: "Sync problem",
};

/** The open project's sync with the account (DSK-14); click to sync now. Hidden while sync is off. */
export function SyncChip({ projectPath, initial }: { projectPath: string; initial?: SyncStatus }) {
  const [status, setStatus] = useState<SyncStatus | null>(initial ?? null);
  useEffect(() => window.kiungo.on("sync:status", (e) => e.projectPath === projectPath && setStatus(e.status)), [projectPath]);
  if (!status || status.state === "off") return null;
  const warn = status.state === "conflict" || status.state === "error" || status.state === "behind" || status.state === "removed";
  const Icon = status.state === "syncing" ? Loader2 : warn ? AlertTriangle : status.state === "synced" ? Cloud : status.state === "offline" || status.state === "signed-out" ? CloudOff : RefreshCw;
  return (
    <button
      type="button"
      onClick={() => void invoke("sync:now", projectPath).then(setStatus)}
      disabled={status.state === "syncing"}
      title={status.message ?? (status.state === "synced" ? `In step with your account (revision ${status.revision}). Click to sync now.` : "Click to sync now.")}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium hover:bg-muted-bg", warn ? "text-warning" : "text-muted")}
      data-testid="sync-status"
      data-state={status.state}
    >
      <Icon className={cn("size-3.5", status.state === "syncing" && "animate-spin")} aria-hidden />
      <span className="hidden xl:inline">{LABEL[status.state]}</span>
    </button>
  );
}
