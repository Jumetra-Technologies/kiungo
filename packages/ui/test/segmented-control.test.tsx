import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "../src/segmented-control";

const OPTIONS = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C", info: "The third view." },
] as const;

describe("SegmentedControl", () => {
  it("is a radiogroup that changes with clicks and arrow keys, wrapping at the ends", () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="a" label="View" options={[...OPTIONS]} onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    expect(within(group).getByRole("radio", { name: "A" })).toBeChecked();
    fireEvent.click(within(group).getByRole("radio", { name: "C" }));
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(within(group).getByRole("radio", { name: "A" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(within(group).getByRole("radio", { name: "A" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(within(group).getByRole("radio", { name: "A" }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("opens an option's note from its i button and closes it with Escape", () => {
    render(<SegmentedControl value="a" label="View" options={[...OPTIONS]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "About C" }));
    expect(screen.getByRole("note")).toHaveTextContent("The third view.");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
