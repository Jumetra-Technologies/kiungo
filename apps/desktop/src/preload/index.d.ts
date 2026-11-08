import type { KiungoApi } from "./index";

declare global {
  interface Window {
    kiungo: KiungoApi;
  }
}
