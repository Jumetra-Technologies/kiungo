import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppInfo, AuthState, UpdateInfo } from "@kiungo/api";
import { SettingsDialog } from "../src/renderer/src/settings/SettingsDialog";
import type { UpdateControls } from "../src/renderer/src/update/useUpdate";

const signedOut: AuthState = { status: "signed-out", message: null, canSkip: true, skipped: true };
const signedIn: AuthState = { status: "signed-in", user: { id: "u1", email: "ada@example.test", name: "Ada Lovelace", photoUrl: null }, deviceName: "Ada's laptop", offline: false, secureStorage: true };
const info: AppInfo = { appVersion: "0.12.1", platform: "win32", arch: "x64", versions: { electron: "44.9.3", chrome: "140", node: "22" } };

function updateControls(state: UpdateInfo["state"], extra: Partial<UpdateControls> = {}): UpdateControls {
  return { info: { currentVersion: "0.12.1", channel: "beta", state }, asked: false, refused: null, later: null, check: vi.fn(), install: vi.fn(async () => ({ ok: true as const })), dismiss: vi.fn(), putOff: vi.fn(), ...extra };
}

// jsdom doesn't implement <dialog>'s showModal/close (DSK's own Dialog calls them to open and shut).
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (!("close" in HTMLDialogElement.prototype) || typeof HTMLDialogElement.prototype.close !== "function") {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

beforeEach(() => {
  (window as unknown as { kiungo: { invoke: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } }).kiungo = { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
});

describe("the Settings dialog", () => {
  it("shows the signed-in profile and a way to sign out or switch account", () => {
    render(<SettingsDialog open onClose={vi.fn()} auth={signedIn} appearance="system" onAppearance={vi.fn()} update={null} info={null} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.test")).toBeInTheDocument();
    expect(screen.getByText(/Signed in on Ada's laptop/)).toBeInTheDocument();
    expect(screen.getByTestId("settings-switch-account")).toBeInTheDocument();
    expect(screen.getByTestId("settings-sign-out")).toBeInTheDocument();
  });

  it("offers Sign in when nobody's signed in", () => {
    render(<SettingsDialog open onClose={vi.fn()} auth={signedOut} appearance="system" onAppearance={vi.fn()} update={null} info={null} />);
    expect(screen.getByTestId("settings-sign-in")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-sign-out")).not.toBeInTheDocument();
  });

  it("lets the person pick Light, Dark, or System, and reports the choice", () => {
    const onAppearance = vi.fn();
    render(<SettingsDialog open onClose={vi.fn()} auth={signedIn} appearance="system" onAppearance={onAppearance} update={null} info={null} />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(dark);
    expect(onAppearance).toHaveBeenCalledWith("dark");
  });

  it("shows the version Kiungo is running, with its channel and platform", () => {
    render(<SettingsDialog open onClose={vi.fn()} auth={signedIn} appearance="light" onAppearance={vi.fn()} update={updateControls({ status: "up-to-date", checkedAt: "x" })} info={info} />);
    expect(screen.getByTestId("settings-version")).toHaveTextContent("Kiungo 0.12.1 beta");
    expect(screen.getByText("Windows · x64")).toBeInTheDocument();
  });

  it("offers to install a downloaded update right from Settings", () => {
    const install = vi.fn(async () => ({ ok: true as const }));
    render(<SettingsDialog open onClose={vi.fn()} auth={signedIn} appearance="light" onAppearance={vi.fn()} update={updateControls({ status: "ready", version: "0.12.2", checkedAt: "x" }, { install })} info={info} />);
    fireEvent.click(screen.getByTestId("settings-update-install"));
    expect(install).toHaveBeenCalled();
  });

  it("stays closed until opened", () => {
    render(<SettingsDialog open={false} onClose={vi.fn()} auth={signedIn} appearance="system" onAppearance={vi.fn()} update={null} info={null} />);
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });
});
