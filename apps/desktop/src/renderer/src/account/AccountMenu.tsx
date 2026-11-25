import { useState } from "react";
import { LogIn, Settings } from "lucide-react";
import type { AuthState } from "@kiungo/api";
import { Button } from "@kiungo/ui/button";
import { Menu, type MenuEntry } from "@kiungo/ui/menu";
import { invoke } from "../ipc";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Shared with the Settings dialog, so the same face shows there. */
export function Avatar({ name, photo, className = "size-8" }: { name: string; photo: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) return <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${className} rounded-full object-cover`} />;
  return <span className={`${className} flex items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-primary`}>{initials(name)}</span>;
}

/** Who's signed in, with Settings and Sign out or Switch account (DSK-03). Signing out never touches projects on disk. */
export function AccountMenu({ state, onSettings }: { state: AuthState; onSettings: () => void }) {
  if (state.status !== "signed-in") {
    return (
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" onClick={() => void invoke("auth:sign-in")} data-testid="account-sign-in">
          <LogIn className="size-4" aria-hidden />
          Sign in
        </Button>
        <button type="button" onClick={onSettings} aria-label="Settings" title="Settings" className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-muted-bg hover:text-foreground" data-testid="open-settings">
          <Settings className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  const { user, deviceName, offline, secureStorage } = state;
  const items: MenuEntry[] = [
    { id: "who", label: user.name, hint: user.email, disabled: true },
    ...(offline ? [{ id: "offline", label: "Offline: checked when you're back online", disabled: true }] : []),
    ...(!secureStorage ? [{ id: "keychain", label: "No keychain: you'll sign in each time", disabled: true }] : []),
    { type: "separator", id: "s1" },
    { id: "settings", label: "Settings…", icon: <Settings />, onSelect: onSettings },
    { type: "separator", id: "s2" },
    {
      id: "switch",
      label: "Switch account",
      hint: "Your projects stay",
      onSelect: () => void invoke("auth:sign-out").then(() => invoke("auth:sign-in")),
    },
    { id: "out", label: "Sign out", hint: `Of Kiungo on ${deviceName}`, onSelect: () => void invoke("auth:sign-out") },
  ];
  return (
    <Menu label={`Account: ${user.name}`} align="end" items={items} buttonClassName="flex size-9 items-center justify-center rounded-full hover:ring-2 hover:ring-border" title={user.email}>
      <Avatar name={user.name} photo={user.photoUrl} />
    </Menu>
  );
}
