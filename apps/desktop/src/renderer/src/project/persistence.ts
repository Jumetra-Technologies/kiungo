import type { OpenedProject, SaveResult } from "@kiungo/api";
import type { LabData } from "@kiungo/core/lab/types";
import type { LabPersistence } from "@kiungo/lab/store";
import { invoke } from "../ipc";

export type SaveState = { kind: "saved"; at: string | null } | { kind: "saving" } | { kind: "error"; message: string };

/**
 * Keeps the lab's circuit in the project folder (DSK-13). Every change is
 * sent to the main process within 50 ms; it writes the newest state crash-safe,
 * merging bursts. The undo history goes with it.
 */
export function projectPersistence(project: OpenedProject, report: (state: SaveState) => void): LabPersistence {
  let latest: LabData = { version: 1, sessions: [project.session], activeId: project.session.id };
  let inFlight = 0;
  return {
    delayMs: 50,
    read: () => latest,
    readHistory: () => project.history,
    write: (data, history) => {
      latest = data;
      const session = data.sessions.find((s) => s.id === data.activeId) ?? data.sessions[0];
      if (!session) return true;
      inFlight++;
      report({ kind: "saving" });
      const done = (result: SaveResult) => {
        inFlight--;
        if (!result.ok) report({ kind: "error", message: result.message });
        else if (inFlight === 0) report({ kind: "saved", at: result.savedAt });
      };
      invoke("projects:save", project.path, { session, history }).then(done, () => done({ ok: false, message: "Couldn't save the project." }));
      return true;
    },
  };
}

/** Where the lab writes when no project is open: nowhere. */
export const NO_PERSISTENCE: LabPersistence = {
  delayMs: 0,
  read: () => ({ version: 1, sessions: [], activeId: null }),
  write: () => true,
};
