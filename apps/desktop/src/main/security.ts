/**
 * Small checks the main process makes on addresses and launch switches
 * (security audit, Nov 2026). Plain Node, no Electron, so they run in tests.
 */

/** https, or plain http to this computer only (a local backend in development). */
export function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

/**
 * An address a KIUNGO_* variable points the app at, or the default. An installed
 * copy only takes https (or this computer): the session token and the updates
 * must never travel in the clear.
 */
export function overridable(value: string | undefined, fallback: string, packaged: boolean, warn: (message: string) => void = () => undefined): string {
  if (!value) return fallback;
  if (packaged && !isSafeWebUrl(value)) {
    warn("ignored: an installed copy only uses https addresses.");
    return fallback;
  }
  return value.replace(/\/+$/, "");
}

/** Chromium and Node switches that attach a debugger: an installed copy refuses to start with any of them. */
export const DEBUG_SWITCHES = ["remote-debugging-port", "remote-debugging-pipe", "remote-allow-origins", "inspect", "inspect-brk", "inspect-port"] as const;
