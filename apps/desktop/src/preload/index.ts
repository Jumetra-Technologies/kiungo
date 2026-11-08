import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@kiungo/protocol";

const api = {
  appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appVersion),
  runStart: (): Promise<string> => ipcRenderer.invoke(IPC.runStart),
  runStop: (): Promise<string> => ipcRenderer.invoke(IPC.runStop),
  emergencyStop: (): Promise<string> => ipcRenderer.invoke(IPC.emergencyStop),
};

contextBridge.exposeInMainWorld("kiungo", api);

export type KiungoApi = typeof api;
