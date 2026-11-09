/** Electron IPC channel names shared by main, preload and renderer. */
export const IPC = {
  appVersion: "app:version",
  runStart: "run:start",
  runStop: "run:stop",
  emergencyStop: "run:emergency-stop",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
