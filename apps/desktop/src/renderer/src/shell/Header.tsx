import { useState } from "react";
import { Bell, Moon, Search, Sun } from "lucide-react";
import type { Appearance } from "@kiungo/api";
import { shortcut } from "../ipc";
import { NAV_ITEMS, type View } from "./types";

const NOTICES = ["Firmware build passed for Line Follower", "A dataset export finished", "An ESP32 board profile update is available"];

export function Header({ view, appearance, onAppearance, onPalette }: { view: View; appearance: Appearance; onAppearance: (next: Appearance) => void; onPalette: () => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const label = view === "settings" ? "Settings" : NAV_ITEMS.find((i) => i.view === view)?.label ?? view;
  const dark = appearance === "dark" || (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-header-foreground/10 bg-header px-5 text-header-foreground">
      <div className="text-xs text-muted">
        Kiungo <span className="px-1 text-muted/60">/</span> <strong className="font-semibold text-foreground">{label}</strong>
      </div>
      <button
        type="button"
        onClick={onPalette}
        className="mx-auto flex w-[min(440px,42vw)] items-center gap-2 rounded-[10px] border border-border bg-muted-bg px-3 py-2 text-left text-xs text-muted shadow-inner hover:border-primary/40"
      >
        <Search className="size-3.5" aria-hidden />
        <span>Search projects, commands, components…</span>
        <kbd className="ml-auto rounded border border-border bg-surface px-1.5 py-0.5 text-[9px]">{shortcut("K")}</kbd>
      </button>
      <span className="rounded-[8px] bg-[color-mix(in_srgb,var(--success)_14%,var(--surface))] px-2 py-1 text-[10px] font-medium text-success">Systems nominal</span>
      <div className="relative">
        <button type="button" onClick={() => setNotificationsOpen((v) => !v)} aria-label="Notifications" className="relative grid size-8 place-items-center rounded-[10px] text-muted hover:bg-muted-bg">
          <Bell className="size-4" aria-hidden />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning" />
        </button>
        {notificationsOpen ? (
          <div role="menu" className="absolute right-0 top-10 z-30 w-80 rounded-[14px] border border-border bg-surface p-3 shadow-[var(--shadow-md)]">
            <div className="mb-2 text-xs font-semibold text-foreground">Notifications</div>
            {NOTICES.map((text, i) => (
              <div key={text} className="border-t border-border py-2 text-[11px] text-muted first:border-0">
                <span className="text-foreground">{text}</span>
                <div className="mt-0.5 text-[9px] text-muted">{i + 1} hour{i === 0 ? "" : "s"} ago</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onAppearance(dark ? "light" : "dark")}
        aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
        className="grid size-8 place-items-center rounded-[10px] border border-border text-muted hover:bg-muted-bg"
      >
        {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
      </button>
    </header>
  );
}
