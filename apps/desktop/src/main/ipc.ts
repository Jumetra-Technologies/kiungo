import { app, ipcMain } from "electron";
import { IPC } from "@kiungo/protocol";
import { SessionManager } from "./sessions/session-manager";

const sessions = new SessionManager();

export function registerIpc(): void {
  ipcMain.handle(IPC.appVersion, () => app.getVersion());

  ipcMain.handle(IPC.runStart, async () => {
    await sessions.start();
    return sessions.state;
  });

  ipcMain.handle(IPC.runStop, async () => {
    await sessions.stop();
    return sessions.state;
  });

  // SAF-01: emergency stop shares the same path as Stop and must never be blocked.
  ipcMain.handle(IPC.emergencyStop, async () => {
    await sessions.emergencyStop();
    return sessions.state;
  });
}
