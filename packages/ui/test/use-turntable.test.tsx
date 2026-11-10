import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTurntable } from "../src/use-turntable";

function Scene({ onTurn }: { onTurn: (spin: number, tilt: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useTurntable(ref, { spin: 0, tilt: 50, onTurn });
  return <div ref={ref} tabIndex={0} data-testid="scene" />;
}

describe("useTurntable", () => {
  it("turns with the arrow keys, keeps the tilt in range and ignores other keys", () => {
    const onTurn = vi.fn();
    render(<Scene onTurn={onTurn} />);
    const scene = screen.getByTestId("scene");
    expect(scene.style.getPropertyValue("--spin")).toBe("0.00deg");

    fireEvent.keyDown(scene, { key: "ArrowRight" });
    expect(onTurn).toHaveBeenLastCalledWith(15, 50);
    fireEvent.keyDown(scene, { key: "ArrowLeft" });
    fireEvent.keyDown(scene, { key: "ArrowLeft" });
    expect(onTurn).toHaveBeenLastCalledWith(-15, 50);
    fireEvent.keyDown(scene, { key: "ArrowUp" });
    expect(onTurn).toHaveBeenLastCalledWith(-15, 42);
    for (let i = 0; i < 10; i++) fireEvent.keyDown(scene, { key: "ArrowDown" });
    expect(onTurn).toHaveBeenLastCalledWith(-15, 82);
    expect(scene.style.getPropertyValue("--tilt")).toBe("82.00deg");

    const calls = onTurn.mock.calls.length;
    fireEvent.keyDown(scene, { key: "x" });
    expect(onTurn).toHaveBeenCalledTimes(calls);
  });
});
