/// <reference types="vite/client" />
import type { KiungoBridge } from "@kiungo/api";

declare global {
  interface Window {
    kiungo: KiungoBridge;
  }
}
