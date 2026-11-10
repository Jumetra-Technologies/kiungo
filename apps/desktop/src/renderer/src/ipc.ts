import type { InvokeChannel, InvokeMap } from "@kiungo/api";

/** Ask the main process for something (see @kiungo/api for every channel). */
export function invoke<C extends InvokeChannel>(channel: C, ...args: InvokeMap[C]["args"]): Promise<InvokeMap[C]["result"]> {
  return window.kiungo.invoke(channel, ...args);
}

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

/** "⌘K" on macOS, "Ctrl+K" elsewhere. */
export function shortcut(key: string, opts: { shift?: boolean } = {}): string {
  if (isMac) return `${opts.shift ? "⇧" : ""}⌘${key}`;
  return `Ctrl+${opts.shift ? "Shift+" : ""}${key}`;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or the date. */
export function openedAgo(iso: string, now = Date.now()): string {
  const seconds = (now - Date.parse(iso)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 172_800) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: seconds > 300 * 86_400 ? "numeric" : undefined });
}
