/**
 * Run your own code (RUN-02, RUN-03, EMU-01): the lab's Run builds the
 * project's sketch (a cached build when nothing changed), loads it into an
 * emulated board in a worker, and passes the board's pins and serial back to
 * the lab. The run state goes building → starting → running → stopped, or
 * stops at the build with its problems in the editor.
 *
 * A board marked Physical or Hybrid in the Inspector runs the code for real
 * (sprint 9): the sketch is built with Kiungo's Hybrid layer and uploaded to
 * the board picked in Upload to; virtual parts are played over the link and
 * the lab mirrors what the board drives.
 */

import type { BuildResult, HybridLinkEvent, UploadResult } from "@kiungo/api";
import type { HardwareBoardId } from "@kiungo/core/hardware/boards";
import { hardwareBoard } from "@kiungo/core/hardware/boards";
import { boardIsReal, HYBRID_BOARDS, hybridBindings, hybridValues, outReadings, type HybridBindings } from "@kiungo/core/hybrid/plan";
import { blockingFaults, realBoardFaults } from "@kiungo/core/hybrid/safety";
import type { FromWorker, ToWorker } from "@kiungo/core/emulator/protocol";
import type { PeripheralInput } from "@kiungo/core/emulator/peripherals";
import { EMULATED_PARTS } from "@kiungo/core/lab/program";
import type { LabNode } from "@kiungo/core/lab/types";
import { boardName } from "@kiungo/core/project";
import type { ProgramDriver } from "@kiungo/lab/lab-context";
import EmulatorWorker from "@kiungo/core/emulator/worker?worker";
import { robotFromCircuit, robotWiring } from "@kiungo/core/world/robot";
import type { RobotSpec, WorldObstacle, WorldSpec, WorldState } from "@kiungo/core/world/types";
import { invoke } from "../ipc";

export interface EditorBridge {
  /** Save every open file, so the build compiles what's on screen. */
  flush: () => Promise<void>;
  /** Show a build's problems in the editor. */
  showBuild: (result: BuildResult) => void;
  /** The board picked in Upload to, when it's plugged in. */
  target: () => { port: string; board: HardwareBoardId } | null;
  /** Show a Hybrid run's build and upload, as an upload's. */
  showUpload: (result: UploadResult, target: { port: string; board: HardwareBoardId }) => void;
}

/** How long the board may take to answer after the upload before the run gives up. */
const HELLO_TIMEOUT_MS = 8000;

/** How long loading may take before the run gives up (a worker that never answers). */
const LOAD_TIMEOUT_MS = 10_000;

/** The robot's world while the program runs (sprint 8): the World pane listens and moves obstacles. */
export interface WorldLink {
  /** The world the next run uses; null for a project without one. */
  world: () => WorldSpec | null;
  /** The world's state about 20 times a second, and null when the run stops. */
  onState: (state: WorldState | null, robot: RobotSpec | null) => void;
}

export type ProjectProgramDriver = ProgramDriver & { setObstacles: (obstacles: WorldObstacle[]) => void };

export function programDriver(projectPath: string, projectBoard: string, editor: () => EditorBridge | null, world?: WorldLink): ProjectProgramDriver {
  let worker: Worker | null = null;
  let run = 0;
  /** A run on a real board: its link, and how the lab's sensor values reach it. */
  let real: { bindings: HybridBindings; unlisten: () => void; timer: number | null } | null = null;

  const stop = () => {
    run++;
    world?.onState(null, null);
    if (real) {
      real.unlisten();
      if (real.timer !== null) window.clearTimeout(real.timer);
      real = null;
      void invoke("hybrid:stop").catch(() => undefined);
    }
    if (worker) {
      worker.postMessage({ type: "stop" } satisfies ToWorker);
      worker.terminate();
      worker = null;
    }
  };

  type Start = ProgramDriver["start"];
  /** The run on a real board: Hybrid build, upload, then the link. */
  const startReal = async (...[boardId, inputs, circuit, on]: Parameters<Start>): ReturnType<Start> => {
    const mine = ++run;
    const target = editor()?.target() ?? null;
    if (!target) return { ok: false, message: "This board is marked Physical: plug it in and pick it in Upload to (in the Code pane), then Run again. To run in the lab instead, mark it Virtual." };
    const board = hardwareBoard(target.board);
    if (!board || !HYBRID_BOARDS.has(board.id)) return { ok: false, message: `Hybrid runs work on the Uno and the Nano for now. Pick one in Upload to, or mark the board Virtual to run in the lab.` };
    let bindings: HybridBindings;
    try {
      bindings = hybridBindings(circuit.nodes, circuit.analysis, boardId, board.fqbn);
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    if (bindings.unsupported.length) return { ok: false, message: bindings.unsupported[0].why };
    // Electrical checks first (SAF-03): real current is about to flow.
    const blocking = blockingFaults(circuit.nodes, circuit.analysis, boardId);
    if (blocking.length) {
      const [first] = blocking;
      return { ok: false, message: `Fix ${blocking.length === 1 ? "this" : `these ${blocking.length} problems`} before running on the real board: ${first.title}. ${first.detail}${blocking.length > 1 ? " The others are in Problems." : ""}` };
    }
    on.stage("building");
    await editor()?.flush();
    if (mine !== run) return { ok: false, message: "Stopped." };
    const offStage = window.kiungo.on("upload:stage", ({ projectPath: p, stage }) => {
      if (p === projectPath && stage === "uploading" && mine === run) on.stage("starting");
    });
    // Listen before the upload ends: the board says hello soon after.
    const started = performance.now();
    let hello = false;
    const handle = (event: HybridLinkEvent) => {
      if (mine !== run || event.port !== target.port) return;
      if (event.hello) {
        hello = true;
        if (!event.hello.compatible) {
          on.ended?.("The board runs a different version of Kiungo's Hybrid layer. Run again to upload this one.");
          return;
        }
        if (real?.timer != null) window.clearTimeout(real.timer);
        if (real) real.timer = null;
        // Every value again: the board starts with none.
        const pairs = hybridValues(bindings, inputs);
        if (pairs.length) void invoke("hybrid:set", pairs).catch(() => undefined);
      }
      if (event.lines.length) on.serial(event.lines.map((l) => `${l}\n`).join(""));
      if (event.out && hello) on.readings({ boardId, t: (performance.now() - started) / 1000, speedPercent: 100, pins: outReadings(event.out), crashed: null, where: `${board.name} on ${target.port}` });
      // The board went safe on its own: it stopped hearing Kiungo (SAF-02).
      if (event.safe === "link-lost") on.ended?.("The board stopped hearing Kiungo, so it turned its outputs off. Check the USB cable, then Run again.");
      if (event.closed !== undefined) on.ended?.(event.closed ? `${event.closed} The board's outputs turn off by themselves within half a second.` : "The link to the board closed. The board's outputs turn off by themselves within half a second.");
    };
    const offLink = window.kiungo.on("hybrid:link", handle);
    real = { bindings, unlisten: () => (offStage(), offLink()), timer: null };
    const result = await invoke("hybrid:start", projectPath, target.port, target.board, bindings.plan).catch(() => null);
    offStage();
    if (mine !== run) return { ok: false, message: "Stopped." };
    if (result) editor()?.showUpload(result, target);
    if (!result || !result.ok) {
      stop();
      const errors = result?.build.diagnostics.filter((d) => d.severity === "error").length ?? 0;
      const message = !result
        ? "The upload didn't run. Try again."
        : result.stage === "build"
          ? (result.build.message ?? (errors ? `Your code didn't build: ${errors === 1 ? "1 problem" : `${errors} problems`} in Code problems.` : "Your code didn't build. The build log says why."))
          : (result.problem?.title ?? "The upload didn't finish. The Code pane says what to try.");
      return { ok: false, message };
    }
    if (!hello && real) {
      real.timer = window.setTimeout(() => {
        if (mine === run && !hello) on.ended?.("The board didn't answer after the upload. Check it's still plugged in, then Run again.");
      }, HELLO_TIMEOUT_MS);
    }
    return { ok: true, programBytes: result.build.flash?.used ?? 0, where: `the real ${board.name} on ${target.port}`, real: true };
  };

  return {
    boardFor: (nodes: LabNode[]) => (EMULATED_PARTS.has(projectBoard) ? (nodes.find((n) => n.partId === projectBoard)?.id ?? null) : null),

    whyNot: (nodes: LabNode[]) => {
      if (!EMULATED_PARTS.has(projectBoard)) return `Run shows the built-in behavior: your code runs in the lab on the Arduino Uno for now, and the ${boardName(projectBoard)} comes later. Upload runs it on a real board.`;
      if (!nodes.some((n) => n.partId === projectBoard)) return `Add an ${boardName(projectBoard)} to the circuit to run your code on it.`;
      return null;
    },

    start: async (boardId, inputs, circuit, on) => {
      stop();
      if (boardIsReal(circuit.nodes.find((n) => n.id === boardId))) return startReal(boardId, inputs, circuit, on);
      const mine = ++run;
      on.stage("building");
      await editor()?.flush();
      const build = await invoke("build:compile", projectPath).catch(() => null);
      if (mine !== run) return { ok: false, message: "Stopped." };
      if (!build) return { ok: false, message: "The build didn't run. Try again." };
      editor()?.showBuild(build);
      if (!build.ok || !build.hex) {
        const errors = build.diagnostics.filter((d) => d.severity === "error").length;
        return { ok: false, message: build.message ?? (errors ? `Your code didn't build: ${errors === 1 ? "1 problem" : `${errors} problems`} in Code problems.` : "Your code didn't build. The build log says why.") };
      }
      on.stage("starting");
      // A circuit with two motors on the board is a robot: it drives in the project's world.
      const spec = world?.world() ?? null;
      const robot = spec ? robotFromCircuit(circuit.nodes, circuit.analysis, boardId) : null;
      const w = new EmulatorWorker();
      worker = w;
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          if (mine !== run) return;
          stop();
          resolve({ ok: false, message: "The emulated board didn't start. Try Run again." });
        }, LOAD_TIMEOUT_MS);
        let programBytes = 0;
        const begin = () => {
          window.clearTimeout(timer);
          w.postMessage({ type: "peripherals", inputs } satisfies ToWorker);
          w.postMessage({ type: "start" } satisfies ToWorker);
          resolve({ ok: true, programBytes });
        };
        w.onmessage = (event: MessageEvent<FromWorker>) => {
          if (mine !== run) return;
          const m = event.data;
          switch (m.type) {
            case "loaded":
              programBytes = m.programBytes;
              if (spec && robot) {
                w.postMessage({ type: "world", world: spec, robot, wiring: robotWiring(robot, circuit.nodes, circuit.analysis, boardId) } satisfies ToWorker);
                break;
              }
              begin();
              break;
            case "world-ready":
              begin();
              break;
            case "readings":
              on.readings({ boardId, t: m.simMs / 1000, speedPercent: m.speedPercent, pins: m.pins, crashed: m.crashed });
              if (m.world) world?.onState(m.world, robot);
              break;
            case "serial":
              on.serial(m.text);
              break;
            case "error":
              window.clearTimeout(timer);
              stop();
              resolve({ ok: false, message: m.message });
              break;
          }
        };
        w.onerror = () => {
          window.clearTimeout(timer);
          if (mine !== run) return;
          stop();
          resolve({ ok: false, message: "The emulated board stopped unexpectedly." });
        };
        w.postMessage({ type: "load", board: "uno", hex: build.hex as string } satisfies ToWorker);
      });
    },

    stop,

    setInputs: (inputs: PeripheralInput[]) => {
      if (real) {
        const pairs = hybridValues(real.bindings, inputs);
        if (pairs.length) void invoke("hybrid:set", pairs).catch(() => undefined);
        return;
      }
      worker?.postMessage({ type: "peripherals", inputs } satisfies ToWorker);
    },

    sendSerial: (text: string) => {
      if (real) void invoke("hybrid:serial-in", text).catch(() => undefined);
      else worker?.postMessage({ type: "serial-in", text } satisfies ToWorker);
    },

    faults: ({ nodes, wires, analysis }) => {
      const board = nodes.find((n) => n.partId === projectBoard);
      return board ? realBoardFaults(nodes, wires, analysis, board.id) : [];
    },

    emergencyStop: () => {
      if (real) void invoke("hybrid:emergency-stop").catch(() => undefined);
    },

    setObstacles: (obstacles: WorldObstacle[]) => worker?.postMessage({ type: "world-obstacles", obstacles } satisfies ToWorker),
  };
}
