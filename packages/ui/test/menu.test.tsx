import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuList } from "../src/menu";

describe("MenuList", () => {
  it("moves with arrow keys, jumps by letter and picks with Enter", () => {
    const onClose = vi.fn();
    const picked = vi.fn();
    render(
      <MenuList
        at={{ x: 0, y: 0 }}
        onClose={onClose}
        items={[
          { id: "a", label: "Alpha", onSelect: () => picked("a") },
          { id: "b", label: "Bravo", onSelect: () => picked("b") },
          { id: "c", label: "Charlie", disabled: true },
        ]}
      />,
    );
    const [alpha, bravo, charlie] = screen.getAllByRole("menuitem");
    alpha?.focus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(bravo);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "a" });
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(alpha as HTMLElement, { key: "Enter" });
    expect(picked).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalled();
    expect(charlie).toHaveAttribute("aria-disabled", "true");
  });

  it("ignores a disabled item and shows checks, hints, shortcuts, labels and separators", () => {
    const onClose = vi.fn();
    const picked = vi.fn();
    render(
      <MenuList
        at={{ x: 0, y: 0 }}
        onClose={onClose}
        items={[
          { type: "label", id: "l", label: "View" },
          { id: "grid", label: "Grid", checked: true, shortcut: "G", hint: "Snap to it" },
          { type: "separator", id: "s" },
          { id: "off", label: "Off", disabled: true, onSelect: picked },
        ]}
      />,
    );
    const grid = screen.getByRole("menuitemcheckbox", { name: /Grid/ });
    expect(grid).toHaveAttribute("aria-checked", "true");
    expect(within(grid).getByText("Snap to it")).toBeInTheDocument();
    expect(within(grid).getByText("G")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    const off = screen.getByRole("menuitem", { name: /Off/ });
    fireEvent.click(off);
    fireEvent.keyDown(off, { key: "Enter" });
    expect(picked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens a submenu with ArrowRight or a click, closes it with ArrowLeft, and picks inside it", () => {
    const onClose = vi.fn();
    const picked = vi.fn();
    render(
      <MenuList
        at={{ x: 0, y: 0 }}
        onClose={onClose}
        items={[
          {
            id: "open",
            label: "Open recent",
            items: [{ id: "x", label: "x.ino", onSelect: picked }],
          },
          { id: "plain", label: "Plain" },
        ]}
      />,
    );
    const parent = screen.getByRole("menuitem", { name: /Open recent/ });
    expect(parent).toHaveAttribute("aria-haspopup", "menu");
    expect(parent).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(parent, { key: "ArrowRight" });
    expect(parent).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menu")).toHaveLength(2);

    fireEvent.keyDown(screen.getByRole("menuitem", { name: "x.ino" }), { key: "ArrowLeft" });
    expect(parent).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(parent);
    expect(parent).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(parent);
    expect(parent).toHaveAttribute("aria-expanded", "false");

    fireEvent.mouseEnter(parent);
    expect(parent).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Plain" }));
    expect(parent).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(parent, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "x.ino" }));
    expect(picked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
