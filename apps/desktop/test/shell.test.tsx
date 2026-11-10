import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "@kiungo/api";
import { Sidebar } from "../src/renderer/src/shell/Sidebar";
import { SettingsPage } from "../src/renderer/src/settings/SettingsPage";

const signedOut: AuthState = { status: "signed-out", message: null, canSkip: true, skipped: true };

beforeEach(() => {
  (window as unknown as { kiungo: { invoke: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } }).kiungo = { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
});

describe("the sidebar", () => {
  it("always shows the modules that aren't role-gated", () => {
    render(<Sidebar view="dashboard" onView={vi.fn()} roles={[]} auth={signedOut} onSettings={vi.fn()} />);
    expect(screen.getByTestId("nav-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nav-projects")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-firmware")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-research")).not.toBeInTheDocument();
  });

  it("shows a role-gated module once that role is held", () => {
    render(<Sidebar view="dashboard" onView={vi.fn()} roles={["researcher"]} auth={signedOut} onSettings={vi.fn()} />);
    expect(screen.getByTestId("nav-research")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-firmware")).not.toBeInTheDocument();
  });

  it("reports which module was picked", () => {
    const onView = vi.fn();
    render(<Sidebar view="dashboard" onView={onView} roles={[]} auth={signedOut} onSettings={vi.fn()} />);
    fireEvent.click(screen.getByTestId("nav-projects"));
    expect(onView).toHaveBeenCalledWith("projects");
  });
});

describe("the Settings page's Roles & Workspaces section", () => {
  it("toggles a role on and off", () => {
    const onRoles = vi.fn();
    render(<SettingsPage auth={signedOut} appearance="system" onAppearance={vi.fn()} roles={["student"]} onRoles={onRoles} update={null} info={null} />);
    fireEvent.click(screen.getByText("Roles & Workspaces"));
    fireEvent.click(screen.getByTestId("role-hobbyist"));
    expect(onRoles).toHaveBeenCalledWith(["student", "hobbyist"]);
    fireEvent.click(screen.getByTestId("role-student"));
    expect(onRoles).toHaveBeenCalledWith([]);
  });
});
