import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CLOSE_CONFIRM_MS, CloseButton } from "@kiungo/ui/close-button";

describe("CloseButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the pressed box on click, then closes once after a moment", () => {
    const onClose = vi.fn();
    render(<CloseButton onClose={onClose} aria-label="Close settings" />);
    const button = screen.getByRole("button", { name: "Close settings" });
    expect(button).not.toHaveAttribute("data-pressed");

    fireEvent.click(button);
    expect(button).toHaveAttribute("data-pressed", "true");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(button); // a double click still closes once
    act(() => vi.advanceTimersByTime(CLOSE_CONFIRM_MS - 1));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the box while pressed, and drops it if the pointer slides off without clicking", () => {
    render(<CloseButton onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Close" });
    fireEvent.pointerDown(button);
    expect(button).toHaveAttribute("data-pressed", "true");
    fireEvent.pointerLeave(button);
    expect(button).not.toHaveAttribute("data-pressed");
  });

  it("works from the keyboard: Enter clicks, and the box shows", () => {
    const onClose = vi.fn();
    render(<CloseButton onClose={onClose} />);
    const button = screen.getByRole("button", { name: "Close" });
    button.focus();
    fireEvent.click(button); // what Enter or Space dispatches on a button
    expect(button).toHaveAttribute("data-pressed", "true");
    act(() => vi.advanceTimersByTime(CLOSE_CONFIRM_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("doesn't close after it's gone (the dialog closed some other way first)", () => {
    const onClose = vi.fn();
    const { unmount } = render(<CloseButton onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    unmount();
    act(() => vi.advanceTimersByTime(CLOSE_CONFIRM_MS));
    expect(onClose).not.toHaveBeenCalled();
  });
});
