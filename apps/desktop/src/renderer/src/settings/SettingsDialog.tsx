import { CloudDownload, LogIn, Monitor, Moon, Sun } from "lucide-react";
import type { AppInfo, Appearance, AuthState } from "@kiungo/api";
import { Button } from "@kiungo/ui/button";
import { SegmentedControl, type SegmentOption } from "@kiungo/ui/segmented-control";
import { Avatar } from "../account/AccountMenu";
import { invoke } from "../ipc";
import { Dialog } from "../ui/Dialog";
import type { UpdateControls } from "../update/useUpdate";

export const APPEARANCE_OPTIONS: Array<SegmentOption<Appearance>> = [
  { id: "system", label: "System", icon: <Monitor className="size-3.5" aria-hidden />, description: "Follows this computer's own setting" },
  { id: "light", label: "Light", icon: <Sun className="size-3.5" aria-hidden /> },
  { id: "dark", label: "Dark", icon: <Moon className="size-3.5" aria-hidden /> },
];

export const PLATFORM_NAMES: Record<AppInfo["platform"], string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };

/**
 * The signed-in profile, the app's light or dark appearance, and the version
 * it's running — one place for the three things people look for in Settings.
 */
export function SettingsDialog({
  open,
  onClose,
  auth,
  appearance,
  onAppearance,
  update,
  info,
}: {
  open: boolean;
  onClose: () => void;
  auth: AuthState | null;
  appearance: Appearance;
  onAppearance: (appearance: Appearance) => void;
  update: UpdateControls | null;
  /** From app:info, fetched once by the app; null until it answers. */
  info: AppInfo | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Settings" className="w-[min(480px,calc(100vw-48px))]">
      <div className="flex flex-col gap-7 pb-2">
        <section aria-labelledby="settings-account">
          <h3 id="settings-account" className="text-[13px] font-semibold text-muted">
            Account
          </h3>
          <div className="mt-2.5">{auth ? <AccountSummary state={auth} /> : null}</div>
        </section>

        <section aria-labelledby="settings-appearance">
          <h3 id="settings-appearance" className="text-[13px] font-semibold text-muted">
            Appearance
          </h3>
          <div className="mt-2.5">
            <SegmentedControl value={appearance} options={APPEARANCE_OPTIONS} onChange={onAppearance} label="Appearance" />
          </div>
        </section>

        <section aria-labelledby="settings-about">
          <h3 id="settings-about" className="text-[13px] font-semibold text-muted">
            About
          </h3>
          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
            <div>
              <p className="text-[14px] font-medium" data-testid="settings-version">
                Kiungo {info?.appVersion ?? update?.info?.currentVersion ?? "…"}
                {update?.info?.channel === "beta" ? " beta" : ""}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">{info ? `${PLATFORM_NAMES[info.platform] ?? info.platform} · ${info.arch}` : "Checking…"}</p>
            </div>
            {update?.info ? <UpdateRow update={update} info={update.info} /> : null}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

export function AccountSummary({ state }: { state: AuthState }) {
  if (state.status !== "signed-in") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
        <p className="text-[13.5px] text-muted">Not signed in to the Kiungo website.</p>
        <Button size="sm" onClick={() => void invoke("auth:sign-in")} data-testid="settings-sign-in">
          <LogIn className="size-3.5" aria-hidden />
          Sign in
        </Button>
      </div>
    );
  }
  const { user, deviceName, offline, secureStorage } = state;
  return (
    <div className="rounded-[12px] border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} photo={user.photoUrl} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{user.name}</p>
          <p className="truncate text-[13px] text-muted">{user.email}</p>
        </div>
      </div>
      <p className="mt-2.5 text-[12.5px] text-muted">Signed in on {deviceName}</p>
      {offline ? <p className="mt-1 text-[12.5px] text-muted">Offline: checked again once this computer&apos;s back online.</p> : null}
      {!secureStorage ? <p className="mt-1 text-[12.5px] text-muted">No keychain on this computer: sign in again each time Kiungo opens.</p> : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => void invoke("auth:sign-out").then(() => invoke("auth:sign-in"))} data-testid="settings-switch-account">
          Switch account
        </Button>
        <Button size="sm" variant="danger" onClick={() => void invoke("auth:sign-out")} data-testid="settings-sign-out">
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function UpdateRow({ update, info }: { update: UpdateControls; info: NonNullable<UpdateControls["info"]> }) {
  const { state } = info;
  if (state.status === "ready") {
    return (
      <Button size="sm" onClick={() => void update.install()} data-testid="settings-update-install">
        <CloudDownload className="size-3.5" aria-hidden />
        Update to {state.version}
      </Button>
    );
  }
  if (state.status === "downloading") return <span className="text-[12.5px] text-muted">Downloading {state.version}, {state.percent}%</span>;
  if (state.status === "unsupported") return null;
  return (
    <Button size="sm" variant="secondary" onClick={update.check} data-testid="settings-update-check">
      <CloudDownload className="size-3.5" aria-hidden />
      Check for updates
    </Button>
  );
}
