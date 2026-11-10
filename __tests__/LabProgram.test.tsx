import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LabWorkspace } from "@kiungo/lab/LabWorkspace";
import type { ProgramDriver } from "@kiungo/lab/lab-context";
import { useLab } from "@kiungo/lab/store";
import type { ProgramReadings } from "@kiungo/core/lab/program";
import { buildStarter } from "@kiungo/core/project";
import { freshLab } from "./helpers/lab";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("DOMMatrixReadOnly", class {
    m22 = 1;
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 900 });
  // Reduced motion: Run starts without the USB lead's animation.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});

beforeEach(() => {
  freshLab();
  const { session } = buildStarter({ name: "Blink", board: "arduino-uno", starter: "blink" });
  useLab.setState({ hydrated: true, sessions: [session], activeId: session.id });
});
afterEach(() => vi.useRealTimers());

/** A driver that stands in for the emulator: the test pushes readings and serial text. */
function fakeDriver(result: { ok: true; programBytes: number; real?: boolean } | { ok: false; message: string } = { ok: true, programBytes: 924 }) {
  const handlers: { readings?: (r: ProgramReadings) => void; serial?: (t: string) => void; ended?: (m: string) => void } = {};
  const driver: ProgramDriver & { started: string[]; stopped: number; inputs: unknown[]; emergencies: number } = {
    started: [],
    stopped: 0,
    inputs: [],
    emergencies: 0,
    emergencyStop: () => {
      driver.emergencies++;
    },
    boardFor: (nodes) => nodes.find((n) => n.partId === "arduino-uno")?.id ?? null,
    start: async (boardId, inputs, _circuit, on) => {
      driver.started.push(boardId);
      driver.inputs.push(inputs);
      handlers.readings = on.readings;
      handlers.serial = on.serial;
      handlers.ended = on.ended;
      on.stage("building");
      return result;
    },
    stop: () => {
      driver.stopped++;
    },
    setInputs: (inputs) => driver.inputs.push(inputs),
  };
  return { driver, handlers };
}

const titleMenu = () => [];

describe("Run with the user's program (RUN-02, RUN-03)", () => {
  it("runs the program on the Uno, and the LED shows what the program does to pin 13", async () => {
    const { driver, handlers } = fakeDriver();
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    const run = await screen.findByTestId("run-toggle");
    expect(run.getAttribute("title")).toBe("Run your code (⌘↵)");
    await act(async () => {
      fireEvent.click(run);
    });
    const board = useLab.getState().sessions[0].nodes[0];
    expect(driver.started).toEqual([board.id]);
    await waitFor(() => expect(screen.getByTestId("run-toggle").textContent).toContain("Stop"));
    act(() => handlers.readings?.({ boardId: board.id, t: 0.6, speedPercent: 100, crashed: null, pins: [{ pin: 13, level: "high", duty: 1, hz: 0, pulseUs: null }] }));
    await waitFor(() => expect(document.body.textContent).toContain("ON"));
    act(() => handlers.readings?.({ boardId: board.id, t: 1.1, speedPercent: 100, crashed: null, pins: [{ pin: 13, level: "low", duty: 0, hz: 0, pulseUs: null }] }));
    await waitFor(() => expect(document.body.textContent).toContain("OFF"));
    fireEvent.click(screen.getByTestId("run-toggle"));
    expect(driver.stopped).toBe(1);
  });

  it("a run that ends by itself (a real board unplugged) stops the lab and says why", async () => {
    const { driver, handlers } = fakeDriver();
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId("run-toggle"));
    });
    await waitFor(() => expect(screen.getByTestId("run-toggle").textContent).toContain("Stop"));
    act(() => handlers.ended?.("The link to the board closed."));
    await waitFor(() => expect(screen.getByTestId("run-toggle").textContent).toContain("Run"));
    expect(screen.getAllByText("The link to the board closed.").length).toBeGreaterThan(0);
    expect(driver.stopped).toBe(1);
  });

  it("a run on a real board shows the emergency stop: it turns the outputs off first, then stops (SAF-01)", async () => {
    const { driver } = fakeDriver({ ok: true, programBytes: 5504, real: true });
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    expect(screen.queryByTestId("emergency-stop")).toBeNull();
    await act(async () => {
      fireEvent.click(await screen.findByTestId("run-toggle"));
    });
    const button = await screen.findByTestId("emergency-stop");
    fireEvent.click(button);
    expect(driver.emergencies).toBe(1);
    expect(driver.stopped).toBe(1);
    await waitFor(() => expect(screen.getByTestId("run-toggle").textContent).toContain("Run"));
    expect(screen.queryByTestId("emergency-stop")).toBeNull();
  });

  it("Esc is the emergency stop while a real board runs, from anywhere", async () => {
    const { driver } = fakeDriver({ ok: true, programBytes: 5504, real: true });
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId("run-toggle"));
    });
    await screen.findByTestId("emergency-stop");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(driver.emergencies).toBe(1);
  });

  it("an emulated run has no emergency stop, and Esc doesn't stop it", async () => {
    const { driver } = fakeDriver();
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId("run-toggle"));
    });
    await waitFor(() => expect(screen.getByTestId("run-toggle").textContent).toContain("Stop"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("emergency-stop")).toBeNull();
    expect(driver.emergencies).toBe(0);
    expect(driver.stopped).toBe(0);
  });

  it("the host's checks join the lab's problems (SAF-03)", async () => {
    const { driver } = fakeDriver();
    const withCheck: ProgramDriver = { ...driver, faults: ({ nodes }) => [{ id: "real-test:x", severity: "error", title: "A real-board problem", detail: "Shown with the lab's own.", nodes: [nodes[0].id], wires: [] }] };
    render(<LabWorkspace program={withCheck} titleMenu={titleMenu} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Problems/ }));
    expect(await screen.findByText("A real-board problem")).toBeTruthy();
  });

  it("the Parts tab says where each part runs and lists what to have on the desk (VER-01, VER-03)", async () => {
    const { driver } = fakeDriver();
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Parts/ }));
    const panel = await screen.findByTestId("parts-panel");
    expect(panel.querySelectorAll("[data-status]").length).toBe(useLab.getState().sessions[0].nodes.length);
    // Every part is Virtual in a new project: the desk list is empty until something is marked Physical.
    expect(panel.textContent).toContain("Nothing is on the desk yet");
    fireEvent.click(screen.getByRole("radio", { name: /Everything/ }));
    expect(screen.getByTestId("bom").textContent).toContain("Arduino Uno");
  });

  it("a build that fails stops the run and says why", async () => {
    const { driver } = fakeDriver({ ok: false, message: "Your code didn't build: 1 problem in Code problems." });
    render(<LabWorkspace program={driver} titleMenu={titleMenu} />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId("run-toggle"));
    });
    await waitFor(() => expect(screen.getAllByText("Your code didn't build: 1 problem in Code problems.").length).toBeGreaterThan(0));
    expect(screen.getByTestId("run-toggle").textContent).toContain("Run");
  });

  it("with no board that runs the program, Run says why and runs the built-in behavior", async () => {
    const { driver } = fakeDriver();
    const none: ProgramDriver = { ...driver, boardFor: () => null, whyNot: () => "Add an Arduino Uno to the circuit to run your code on it." };
    render(<LabWorkspace program={none} titleMenu={titleMenu} />);
    expect((await screen.findByTestId("run-toggle")).getAttribute("title")).toBe("Add an Arduino Uno to the circuit to run your code on it.");
  });
});
