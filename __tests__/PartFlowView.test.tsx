import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartFlowView } from "@kiungo/lab/views/PartFlowView";
import { getPart } from "@kiungo/core/parts";

const ldr = getPart("ldr")!;

describe("Trace view (part circuit)", () => {
  it("in the library: the diagram, a hover note and the numbered steps", () => {
    render(<PartFlowView model={ldr} powered />);
    expect(screen.getByRole("img", { name: /How the Light-dependent resistor works inside/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "How it works" })).toBeInTheDocument();
  });

  it("compact (lab Inspector): only the diagram and a one-line note over its foot, so nothing is squeezed on top of anything", () => {
    render(<PartFlowView model={ldr} powered compact />);
    const flow = screen.getByTestId("part-flow");
    expect(flow).toHaveAttribute("data-compact", "true");
    expect(within(flow).queryByRole("list", { name: "How it works" })).toBeNull();
    const note = screen.getByTestId("part-flow-note");
    expect(note).toHaveClass("absolute", "truncate");
    expect(note).toHaveTextContent("Current flows along the highlighted paths.");
    fireEvent.mouseEnter(flow.querySelector("[data-block]")!);
    expect(note.textContent).toMatch(/^Light\./);
  });
});
