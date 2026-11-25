import { useState } from "react";
import type { AppInfo, Appearance, AuthState, Role } from "@kiungo/api";
import { ROLE_LABELS, ROLES } from "@kiungo/api";
import { Check, Moon, Sun, Monitor } from "lucide-react";
import { SegmentedControl } from "@kiungo/ui/segmented-control";
import { AccountSummary, APPEARANCE_OPTIONS, PLATFORM_NAMES, UpdateRow } from "./SettingsDialog";
import { PageTitle, SettingRow, SettingsHeading, Toggle } from "../shell/widgets";
import type { UpdateControls } from "../update/useUpdate";

const SECTIONS = [
  "Profile",
  "Account & Security",
  "Roles & Workspaces",
  "Appearance",
  "Preferences",
  "Projects",
  "Simulation",
  "Firmware & Hardware",
  "AI Assistant",
  "Collaboration",
  "Notifications",
  "Marketplace",
  "Institution / Company",
  "Privacy",
  "About",
] as const;
type Section = (typeof SECTIONS)[number];

export function SettingsPage({
  auth,
  appearance,
  onAppearance,
  roles,
  onRoles,
  update,
  info,
}: {
  auth: AuthState | null;
  appearance: Appearance;
  onAppearance: (next: Appearance) => void;
  roles: Role[];
  onRoles: (next: Role[]) => void;
  update: UpdateControls | null;
  info: AppInfo | null;
}) {
  const [section, setSection] = useState<Section>("Profile");
  const toggleRole = (role: Role) => onRoles(roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]);

  return (
    <div className="mx-auto max-w-[1180px] p-6" data-testid="settings-page">
      <PageTitle title="Settings" detail="Your personal control center for identity, roles, workspaces, tools, and organizations." />
      <div className="grid grid-cols-[210px_minmax(0,1fr)] gap-5">
        <aside className="rounded-[14px] border border-border bg-surface p-2">
          {SECTIONS.map((item) => (
            <button key={item} type="button" onClick={() => setSection(item)} className={`w-full rounded-[10px] px-3 py-2 text-left text-[11.5px] ${section === item ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] font-semibold text-primary" : "text-muted hover:bg-muted-bg"}`}>
              {item}
            </button>
          ))}
        </aside>
        <section className="rounded-[14px] border border-border bg-surface p-6">
          {section === "Profile" ? (
            <>
              <SettingsHeading title="Professional profile" detail="Control how you appear across the Kiungo community." />
              {auth ? <AccountSummary state={auth} /> : null}
            </>
          ) : null}

          {section === "Account & Security" ? (
            <>
              <SettingsHeading title="Account & security" detail="Protect your Kiungo account and review connected access." />
              {auth ? <AccountSummary state={auth} /> : null}
            </>
          ) : null}

          {section === "Roles & Workspaces" ? (
            <>
              <SettingsHeading title="Roles & workspaces" detail="Roles unlock modules inside one Kiungo account. They never create separate profiles." />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ROLES.map((role) => {
                  const on = roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      aria-pressed={on}
                      data-testid={`role-${role}`}
                      className={`flex items-center gap-3 rounded-[12px] border p-4 text-left ${on ? "border-primary/50 bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))]" : "border-border"}`}
                    >
                      <span className={`grid size-6 place-items-center rounded-[8px] ${on ? "bg-primary text-primary-foreground" : "bg-muted-bg text-transparent"}`}>
                        <Check className="size-3.5" aria-hidden />
                      </span>
                      <span>
                        <strong className="block text-xs text-foreground">{ROLE_LABELS[role]}</strong>
                        <span className="text-[10.5px] text-muted">{on ? "Enabled · modules available" : "Add role to unlock modules"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {section === "Appearance" ? (
            <>
              <SettingsHeading title="Appearance" detail="Tune Kiungo for long engineering sessions and your display environment." />
              <SettingRow title="Theme" detail="Light, dark, or your computer's own setting">
                <SegmentedControl value={appearance} options={APPEARANCE_OPTIONS} onChange={onAppearance} label="Appearance" />
              </SettingRow>
              <SettingRow title="Quick preview" detail="How the theme looks right now">
                <div className="flex gap-2 text-muted">
                  <Monitor className="size-4" aria-hidden />
                  <Sun className="size-4" aria-hidden />
                  <Moon className="size-4" aria-hidden />
                </div>
              </SettingRow>
            </>
          ) : null}

          {section === "Preferences" ? <PlaceholderSection title="Preferences" detail="Compact mode, interface animations, and other personal interface behavior." rows={["Compact mode", "Interface animations"]} /> : null}
          {section === "Projects" ? <PlaceholderSection title="Projects" detail="Where new projects are made, and how often they're backed up." rows={["Autosave on close", "Warn before closing unsaved work"]} /> : null}
          {section === "Simulation" ? <PlaceholderSection title="Simulation" detail="Defaults for the lab canvas: grid, snapping, and the view it opens in." rows={["Snap to grid", "Open in 3D by default"]} /> : null}
          {section === "Firmware & Hardware" ? <PlaceholderSection title="Firmware & hardware" detail="Build tooling, board manager, and upload defaults." rows={["Verbose build output", "Confirm before uploading to a physical board"]} /> : null}
          {section === "AI Assistant" ? <PlaceholderSection title="AI Assistant" detail="How much project context the assistant can read." rows={["Share the open project's circuit", "Share build and upload logs"]} /> : null}
          {section === "Collaboration" ? <PlaceholderSection title="Collaboration" detail="Who can see your workspaces and shared projects." rows={["Allow workspace invitations", "Show my activity to teammates"]} /> : null}
          {section === "Notifications" ? <PlaceholderSection title="Notifications" detail="What Kiungo tells you about, and how." rows={["Build and upload results", "Marketplace order updates"]} /> : null}
          {section === "Marketplace" ? <PlaceholderSection title="Marketplace" detail="Purchasing method and default shipping details." rows={["Remember my purchasing method", "Email me order receipts"]} /> : null}
          {section === "Institution / Company" ? <PlaceholderSection title="Institution / company" detail="The organization this account is affiliated with, if any." rows={["Share my activity with my institution"]} /> : null}
          {section === "Privacy" ? <PlaceholderSection title="Privacy" detail="What Kiungo keeps, and for how long." rows={["Share anonymous usage statistics"]} /> : null}

          {section === "About" ? (
            <>
              <SettingsHeading title="About" detail="The version you're running, and whether an update is ready." />
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-background px-4 py-3.5">
                <div>
                  <p className="text-[14px] font-medium">
                    Kiungo {info?.appVersion ?? update?.info?.currentVersion ?? "…"}
                    {update?.info?.channel === "beta" ? " beta" : ""}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">{info ? `${PLATFORM_NAMES[info.platform] ?? info.platform} · ${info.arch}` : "Checking…"}</p>
                </div>
                {update?.info ? <UpdateRow update={update} info={update.info} /> : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** Sections the desktop app doesn't back with a real setting yet: described honestly, with a couple of local, non-persisted toggles. */
function PlaceholderSection({ title, detail, rows }: { title: string; detail: string; rows: string[] }) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <>
      <SettingsHeading title={title} detail={detail} />
      <p className="mb-4 rounded-[10px] bg-muted-bg p-3 text-[11px] text-muted">These aren&apos;t wired to a real setting yet, so nothing here is saved between sessions.</p>
      {rows.map((row) => (
        <SettingRow key={row} title={row} detail="Not yet saved">
          <Toggle on={on[row] ?? false} onChange={(next) => setOn((s) => ({ ...s, [row]: next }))} />
        </SettingRow>
      ))}
    </>
  );
}
