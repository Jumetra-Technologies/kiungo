/**
 * The only bridge between the interface and the main process. It exposes
 * invoke, limited to the channels in @kiungo/api, and on, limited to the
 * events listed there.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { isEventChannel, isInvokeChannel, type KiungoBridge } from "@kiungo/api";

const bridge: KiungoBridge = {
  invoke: (channel, ...args) => {
    if (!isInvokeChannel(channel)) return Promise.reject(new Error(`Unknown channel ${String(channel)}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, listener) => {
    if (!isEventChannel(channel)) throw new Error(`Unknown event ${String(channel)}`);
    // The listener gets the payload only, never the IPC event (it would expose ipcRenderer).
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("kiungo", bridge);
