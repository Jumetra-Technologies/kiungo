"use client";

import { useSyncExternalStore } from "react";

/** Whether the lab plays sound. On by default; remembered in this browser. */
const KEY = "hhip-lab-sound";
const EVENT = "hhip-lab-sound";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLabSound(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not remembered; still applies now.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLabSound(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
