import { useEffect } from "react";
import type { Appearance } from "@kiungo/api";

/**
 * Light or dark on <html>, for the shared theme to read from [data-theme].
 * "system" follows the computer's own setting, live; "light" and "dark" hold
 * regardless of it, until the person picks something else in Settings.
 */
export function useAppearance(appearance: Appearance): void {
  useEffect(() => {
    const apply = (dark: boolean) => {
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    if (appearance !== "system") {
      apply(appearance === "dark");
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply(query.matches);
    follow();
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [appearance]);
}
