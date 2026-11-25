import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UpdateInfo, UpdateState } from "@kiungo/api";
import { UpdateBanner } from "../src/renderer/src/update/UpdateBanner";
import type { UpdateControls } from "../src/renderer/src/update/useUpdate";

const info = (state: UpdateState): UpdateInfo => ({ currentVersion: "0.12.0", channel: "beta", state });

function controls(state: UpdateState, extra: Partial<UpdateControls> = {}): UpdateControls {
  return {
    info: info(state),
    asked: false,
    refused: null,
    later: null,
    check: vi.fn(),
    install: vi.fn(async () => ({ ok: true as const })),
    dismiss: vi.fn(),
    putOff: vi.fn(),
    ...extra,
  };
}

describe("the update card in the corner", () => {
  it("appears the moment an update is found, with how far the download is", () => {
    render(<UpdateBanner update={controls({ status: "downloading", version: "0.12.1", percent: 42, checkedAt: "2026-11-04T08:00:00Z" })} />);
    const card = screen.getByTestId("update-banner");
    expect(card).toHaveAttribute("data-phase", "downloading");
    expect(card.className).toContain("bottom-4 left-4");
    expect(card).toHaveTextContent("Kiungo 0.12.1 is on its way");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByTestId("update-progress")).toHaveTextContent("42% downloaded");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("once it's ready, the card is the button: one click installs, and says what's happening", async () => {
    const install = vi.fn(async () => ({ ok: true as const }));
    render(<UpdateBanner update={controls({ status: "ready", version: "0.12.1", checkedAt: "2026-11-04T08:00:00Z" }, { install })} />);
    const card = screen.getByTestId("update-restart");
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveTextContent("Kiungo 0.12.1 is ready");
    expect(card).toHaveTextContent("Click to restart and update. Your projects are saved first; it takes a few seconds.");
    await act(async () => {
      fireEvent.click(card);
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(card).toBeDisabled();
    expect(card).toHaveTextContent("Restarting to update to Kiungo 0.12.1…");
    expect(screen.queryByTestId("update-later")).toBeNull();
  });

  it("when the restart has to wait for the board, the card says why and stays clickable", async () => {
    const install = vi.fn(async () => ({ ok: false as const, message: "Stop the run on your board first, then restart to update." }));
    const { rerender } = render(<UpdateBanner update={controls({ status: "ready", version: "0.12.1", checkedAt: "x" }, { install })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("update-restart"));
    });
    rerender(<UpdateBanner update={controls({ status: "ready", version: "0.12.1", checkedAt: "x" }, { install, refused: "Stop the run on your board first, then restart to update." })} />);
    const card = screen.getByTestId("update-restart");
    expect(card).not.toBeDisabled();
    expect(card).toHaveTextContent("Stop the run on your board first, then restart to update.");
  });

  it("Later puts that version's card away, without stopping the install on quit", () => {
    const putOff = vi.fn();
    const { rerender } = render(<UpdateBanner update={controls({ status: "ready", version: "0.12.1", checkedAt: "x" }, { putOff })} />);
    fireEvent.click(screen.getByTestId("update-later"));
    expect(putOff).toHaveBeenCalledWith("0.12.1");
    rerender(<UpdateBanner update={controls({ status: "ready", version: "0.12.1", checkedAt: "x" }, { later: "0.12.1" })} />);
    expect(screen.queryByTestId("update-banner")).toBeNull();
  });

  it("a check nobody asked for stays quiet unless it fails loudly; one the person asked for reports", () => {
    const { rerender } = render(<UpdateBanner update={controls({ status: "checking", checkedAt: null })} />);
    expect(screen.queryByTestId("update-banner")).toBeNull();
    rerender(<UpdateBanner update={controls({ status: "error", message: "Couldn't reach the update server.", quiet: true, checkedAt: null })} />);
    expect(screen.queryByTestId("update-banner")).toBeNull();
    rerender(<UpdateBanner update={controls({ status: "error", message: "Couldn't reach the update server.", quiet: false, checkedAt: null })} />);
    expect(screen.getByTestId("update-banner")).toHaveTextContent("Couldn't reach the update server.");
    rerender(<UpdateBanner update={controls({ status: "up-to-date", checkedAt: "x" }, { asked: true })} />);
    expect(screen.getByTestId("update-banner")).toHaveTextContent("Kiungo 0.12.0 is the newest version");
    rerender(<UpdateBanner update={controls({ status: "unsupported", reason: "platform", message: "Kiungo can't update itself on macOS yet.", downloadUrl: "https://example.test/#desktop" }, { asked: true })} />);
    expect(screen.getByRole("link", { name: "Open the download page" })).toHaveAttribute("href", "https://example.test/#desktop");
  });
});
