"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BookOpen,
  Box,
  ChevronDown,
  CloudOff,
  Copy,
  Cpu,
  Grid2x2,
  Maximize,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Server,
  SkipForward,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Wand2,
  Zap,
  OctagonX,
} from "lucide-react";
import { SegmentedControl } from "@kiungo/ui/segmented-control";
import { ContextMenu, Menu, type MenuEntry } from "@kiungo/ui/menu";
import { Button } from "@kiungo/ui/button";
import { getPart } from "@kiungo/core/parts";
import { analyze, type Analysis } from "@kiungo/core/lab/circuit";
import { frameAt, serialLine } from "@kiungo/core/lab/simulate";
import { peripheralInputs, programFrame, type ProgramReadings } from "@kiungo/core/lab/program";
import { withFaults } from "@kiungo/core/hybrid/safety";
import { LabSound } from "@kiungo/core/lab/sound";
import { setLabSound, useLabSound } from "./sound-pref";
import { describeChanges, RunRecorder } from "@kiungo/core/lab/activity";
import { planAutoWire, placeNode } from "@kiungo/core/lab/autowire";
import { getPinout } from "@kiungo/core/lab/pinout";
import { flushLab, useActiveSession, useLab } from "./store";
import { parseSessionFile, SESSION_FILE_EXTENSION, sessionFileName, SessionFileError, toSessionFile } from "@kiungo/core/lab/session-file";
import type { ProjectContext } from "@kiungo/core/lab/suggest";
import type { LabNode, LabSession, LabView } from "@kiungo/core/lab/types";
import { VIEW_COPY } from "@kiungo/ui/views";
import { cn } from "@kiungo/ui/cn";
import { AddPanel, TEMPLATES, type AddPanelHandle } from "./AddPanel";
import { Inspector } from "./Inspector";
import { LabCanvas, type LabCanvasHandle } from "./LabCanvas";
import { LabContext, LabHostContext, type LabContextValue, type LabHost, type ProgramDriver, type RuntimeStatus } from "./lab-context";
import { LabDock, type DockTab } from "./LabDock";
import { LabSkeleton } from "./LabSkeleton";
import type { PowerState } from "./UsbCable";

const VIEW_OPTIONS = [
  { id: "reality" as const, label: VIEW_COPY["3d"].label, icon: <Box className="size-4" aria-hidden />, description: VIEW_COPY["3d"].description, info: VIEW_COPY["3d"].info },
  { id: "top" as const, label: VIEW_COPY["2d"].label, icon: <Grid2x2 className="size-4" aria-hidden />, description: VIEW_COPY["2d"].description, info: VIEW_COPY["2d"].info },
  { id: "flow" as const, label: VIEW_COPY.trace.label, icon: <Zap className="size-4" aria-hidden />, description: VIEW_COPY.trace.description, info: VIEW_COPY.trace.info },
];

const SPEEDS = [0.25, 0.5, 1, 2, 4];
/** USB lead timing: the click lands as the plug seats; the sketch starts just after; unplugging is quicker. */
const PLUG_CLICK_MS = 380;
const PLUG_SEATED_MS = 520;
const UNPLUG_MS = 320;
const TICK_MS = 100;

function useIsWide(query = "(min-width: 1024px)") {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : true),
    () => true,
  );
}

/** What the title menu (the session or project name in the top bar) can do. */
export interface TitleMenuApi {
  session: LabSession;
  sessions: LabSession[];
  /** Start renaming in place. */
  rename: () => void;
  /** Pick a `.kiungo.json` file to open. */
  openFile: () => void;
  /** Save the build as a `.kiungo.json` file. */
  exportJson: () => void;
}

/** Actions the host can trigger from outside: its menus, its command palette. */
export interface LabWorkspaceHandle {
  toggleRun: () => void;
  run: () => void;
  stop: () => void;
  focusSearch: () => void;
  toggleInspector: () => void;
  fit: () => void;
  setView: (view: LabView) => void;
  undo: () => void;
  redo: () => void;
  openFile: () => void;
  exportJson: () => void;
}

export interface LabWorkspaceProps {
  host?: LabHost;
  /** Kiungo online (website). Omitted: no status pill. */
  runtime?: RuntimeStatus;
  /** The project the session belongs to, for suggestions. */
  project?: (ProjectContext & { id: string }) | null;
  /** Shown beside the title: a link to the project. */
  projectChip?: ReactNode;
  /** "Link a project" in the parts panel; a returned string is shown as a toast. Omitted: not offered. */
  onLinkProject?: () => string | void;
  titleMenu: (api: TitleMenuApi) => MenuEntry[];
  /** What the title menu is called for screen readers: "Session menu", "Project menu". */
  titleMenuLabel?: string;
  /** Where the work is saved, at the end of the top bar. */
  saveStatus?: ReactNode;
  /** Before everything in the top bar (the desktop app's Home button). */
  leading?: ReactNode;
  /** After everything in the top bar, beside the Inspector button (the desktop app's code toggle). */
  trailing?: ReactNode;
  /** Told when a run starts or stops, so the host can show it (the desktop app's editor). */
  onRunningChange?: (running: boolean) => void;
  /** Runs the user's own program on an emulated board (the desktop app). Omitted: every board runs its built-in behavior. */
  program?: ProgramDriver;
  /** Written into exported `.kiungo.json` files. */
  generator?: string;
  /** Open a `.kiungo.json` build. Default: as a new session. Returns what to report. */
  onOpenBuild?: (session: LabSession, fileName: string) => { name: string; nodes: number; wires: number };
}

export const LabWorkspace = forwardRef<LabWorkspaceHandle, LabWorkspaceProps>(function LabWorkspace(
  { host, runtime, project = null, projectChip, onLinkProject, titleMenu, titleMenuLabel = "Session menu", saveStatus, leading, trailing, onRunningChange, program, generator = "Kiungo Engineering Lab", onOpenBuild },
  ref,
) {
  const hydrated = useLab((s) => s.hydrated);
  const sessions = useLab((s) => s.sessions);
  const past = useLab((s) => s.past.length);
  const future = useLab((s) => s.future.length);
  const session = useActiveSession();
  const store = useLab;
  const wide = useIsWide();
  const xl = useIsWide("(min-width: 1280px)");

  // Panels
  // Panels start open where there's room for them beside the canvas.
  const fits = (query: string) => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia(query).matches;
  // The canvas gets the whole screen when a session opens; the parts panel
  // and the inspector wait behind their buttons in the top bar (and "/" or
  // right-click → Search parts / Inspect).
  const [leftOpen, setLeftOpenRaw] = useState(false);
  const [rightOpen, setRightOpenRaw] = useState(false);
  const [dockOpen, setDockOpen] = useState(() => fits("(min-height: 720px) and (min-width: 768px)"));
  const [dockTab, setDockTab] = useState<DockTab>("activity");
  const [dockHeight, setDockHeight] = useState(200);
  const [autowire, setAutowire] = useState(true);

  // Selection and feedback
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedWire, setSelectedWire] = useState<string | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; target: { node?: string; wire?: string; flow?: { x: number; y: number } } } | null>(null);
  const [renaming, setRenaming] = useState(false);

  // Simulation
  const [running, setRunning] = useState(false);
  const runningListener = useRef(onRunningChange);
  useEffect(() => {
    runningListener.current = onRunningChange;
  }, [onRunningChange]);
  useEffect(() => {
    runningListener.current?.(running);
  }, [running]);
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [serial, setSerial] = useState<string[]>([]);
  const recorder = useRef<RunRecorder | null>(null);

  // On narrow screens the panels are overlays: one at a time.
  const [lastPanel, setLastPanel] = useState<"left" | "right">("left");
  const setLeftOpen = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLeftOpenRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (next) setLastPanel("left");
      return next;
    });
  }, []);
  const setRightOpen = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setRightOpenRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (next) setLastPanel("right");
      return next;
    });
  }, []);
  // Where panels overlay the canvas, show only the one opened last.
  const showLeft = leftOpen && (wide || !rightOpen || lastPanel === "left");
  const showRight = rightOpen && (xl || !showLeft || lastPanel === "right");

  // Imperative handles kept in state (not refs) so callbacks made during render may use them.
  const [canvasApi, setCanvasApi] = useState<LabCanvasHandle | null>(null);
  const [addPanelApi, setAddPanelApi] = useState<AddPanelHandle | null>(null);

  useEffect(() => {
    const save = () => flushLab();
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      flushLab();
    };
  }, []);

  // ----- analysis, frames and the log ------------------------------------------
  const nodes = useMemo(() => session?.nodes ?? [], [session?.nodes]);
  const wires = useMemo(() => session?.wires ?? [], [session?.wires]);
  const inputs = session?.inputs;
  // Inputs carry part values the check needs (a resistor's ohms).
  const lab = useMemo(() => analyze(nodes, wires, inputs), [nodes, wires, inputs]);
  // The host's own checks (a real board's, SAF-03) join the lab's problems.
  const analysis = useMemo(() => (program?.faults ? withFaults(lab, program.faults({ nodes, wires, analysis: lab })) : lab), [program, nodes, wires, lab]);
  // The user's program, when a board runs it (desktop): its readings replace that board's built-in behavior.
  /** Stop, for a program run that ends by itself (set once stopRun exists, below). */
  const stopRunRef = useRef<() => void>(() => undefined);
  const [programRun, setProgramRun] = useState<{ boardId: string; readings: ProgramReadings | null; stage: "building" | "starting" | "running"; real?: boolean } | null>(null);
  const programBoard = useMemo(() => program?.boardFor(nodes) ?? null, [program, nodes]);
  const baseFrame = useMemo(() => frameAt(nodes, wires, analysis, t, running, inputs), [nodes, wires, analysis, t, running, inputs]);
  const frame = useMemo(() => (programRun?.readings && running ? programFrame(baseFrame, nodes, wires, analysis, programRun.readings) : baseFrame), [baseFrame, programRun, running, nodes, wires, analysis]);
  // Signals can't re-run the emulator for past moments, so a program run keeps its recent pin levels.
  const historyRef = useRef<Array<{ t: number; pins: Record<string, number> }>>([]);
  const [history, setHistory] = useState<Array<{ t: number; pins: Record<string, number> }> | undefined>(undefined);
  useEffect(() => {
    if (!programRun?.readings || !running) return;
    const at = programRun.readings.t;
    const list = historyRef.current.filter((h) => h.t > at - 4.5 && h.t < at);
    list.push({ t: at, pins: frame.pins });
    historyRef.current = list;
    setHistory(list);
  }, [frame, programRun, running]);

  const prevAnalysis = useRef<{ id: string; analysis: Analysis } | null>(null);
  useEffect(() => {
    if (!session) return;
    const prev = prevAnalysis.current;
    prevAnalysis.current = { id: session.id, analysis };
    if (!prev || prev.id !== session.id) return;
    const drafts = describeChanges(prev.analysis, analysis, nodes);
    for (const d of drafts) store.getState().log(d.kind, d.text, d.nodes);
  }, [analysis, session, nodes, store]);

  // Simulation clock. Each tick advances time and, once a simulated second,
  // has every board print its readings to the serial monitor.
  const latest = useRef({ nodes, wires, analysis, t, inputs });
  useEffect(() => {
    latest.current = { nodes, wires, analysis, t, inputs };
  }, [nodes, wires, analysis, t, inputs]);
  const lastSecond = useRef(-1);
  const programBoardRef = useRef<string | null>(null);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const { nodes: ns, wires: ws, analysis: an, t: now, inputs: ins } = latest.current;
      const next = Math.round((now + (TICK_MS / 1000) * speed) * 1000) / 1000;
      latest.current.t = next;
      setT(next);
      const second = Math.floor(next);
      if (second !== lastSecond.current) {
        lastSecond.current = second;
        const own = programBoardRef.current;
        // The program's board prints what the program prints: leave it and its parts out of the built-in lines.
        const others = own ? ns.filter((n) => n.id !== own && !an.nodes[n.id]?.links.some((l) => l.board === own)) : ns;
        const line = serialLine(others, frameAt(ns, ws, an, next, true, ins));
        if (line) setSerial((lines) => [...lines, line].slice(-300));
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, speed]);

  const sentInputs = useRef("");
  useEffect(() => {
    if (!program || !programRun || programRun.stage !== "running" || !running) return;
    const { inputs: list } = peripheralInputs(nodes, analysis, inputs, programRun.boardId, programRun.readings?.t ?? 0);
    const key = JSON.stringify(list);
    if (key === sentInputs.current) return;
    sentInputs.current = key;
    program.setInputs(list);
  }, [program, programRun, running, nodes, analysis, inputs, t]);

  useEffect(() => {
    if (!running || !session) return;
    recorder.current?.setNodes(nodes);
    for (const d of recorder.current?.frame(frame, analysis) ?? []) store.getState().log(d.kind, d.text, d.nodes);
  }, [frame, running, session, nodes, analysis, store]);

  // Sound: buzzers you can hear. The engine is made on first use; browsers
  // only allow audio after a click, so Run and the sound button unlock it.
  const soundOn = useLabSound();
  const sound = useRef<LabSound | null>(null);
  const soundEngine = useCallback(() => (sound.current ??= new LabSound()), []);
  useEffect(() => () => sound.current?.dispose(), []);
  useEffect(() => {
    sound.current?.setEnabled(soundOn);
  }, [soundOn]);
  useEffect(() => {
    const voices = Object.entries(frame.nodes).flatMap(([id, live]) => (live.tone ? [{ id, hz: live.tone.hz, pattern: live.tone.pattern }] : []));
    sound.current?.update({ running, t: frame.t, speed, voices });
  }, [frame, running, speed]);
  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setLabSound(next);
    const engine = soundEngine();
    engine.setEnabled(next);
    if (next) engine.unlock();
  }, [soundOn, soundEngine]);

  // Power: on Run, each board's USB lead plugs in (drop, settle, click), and
  // the sketch starts once it's seated; on Stop the lead comes out and the
  // power cuts at once. Skipped for people who prefer less motion.
  const [power, setPower] = useState<PowerState>("off");
  const powerTimer = useRef<number | null>(null);
  const clearPowerTimer = () => {
    if (powerTimer.current !== null) window.clearTimeout(powerTimer.current);
    powerTimer.current = null;
  };
  useEffect(() => clearPowerTimer, []);
  const hasBoard = nodes.some((n) => getPinout(n.partId).controller);
  const calm = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const startRun = useCallback(() => {
    if (running || power === "plugging" || !session) return;
    const engine = soundEngine();
    engine.setEnabled(soundOn);
    engine.unlock();
    const begin = () => {
      powerTimer.current = null;
      recorder.current = new RunRecorder(nodes);
      recorder.current.start(t);
      store.getState().log("run", `Run started${nodes.length ? ` with ${nodes.length} part${nodes.length === 1 ? "" : "s"}` : ""}`);
      setRunning(true);
      setPower(hasBoard ? "on" : "off");
    };
    // The user's program: build and load it while the lead plugs in; the run starts when it's ready.
    if (program && programBoard) {
      const boardId = programBoard;
      programBoardRef.current = boardId;
      historyRef.current = [];
      setProgramRun({ boardId, readings: null, stage: "building" });
      setPower("plugging");
      if (hasBoard) engine.click(PLUG_CLICK_MS / 1000);
      const initial = peripheralInputs(nodes, analysis, inputs, boardId, 0).inputs;
      sentInputs.current = JSON.stringify(initial);
      void program
        .start(boardId, initial, { nodes, analysis }, {
          stage: (stage) => setProgramRun((p) => (p && p.boardId === boardId ? { ...p, stage } : p)),
          readings: (readings) => setProgramRun((p) => (p && p.boardId === boardId ? { ...p, readings, stage: "running" } : p)),
          ended: (message) => {
            if (programBoardRef.current !== boardId) return;
            store.getState().log("fault", `Run stopped: ${message}`);
            setToast(message);
            stopRunRef.current();
          },
          serial: (text) =>
            setSerial((lines) => {
              // The board's text arrives in pieces: join to the last line until a newline.
              const parts = text.replace(/\r/g, "").split("\n");
              const next = lines.length ? [...lines.slice(0, -1), lines[lines.length - 1] + parts[0], ...parts.slice(1)] : parts;
              return next.slice(-300);
            }),
        })
        .then((result) => {
          if (programBoardRef.current !== boardId) return;
          if (!result.ok) {
            programBoardRef.current = null;
            setProgramRun(null);
            setPower("off");
            store.getState().log("fault", `Run stopped: ${result.message}`);
            setToast(result.message);
            return;
          }
          setSerial((lines) => (lines.length && lines[lines.length - 1] !== "" ? [...lines, ""] : lines));
          if (result.real) setProgramRun((p) => (p && p.boardId === boardId ? { ...p, real: true } : p));
          begin();
          store.getState().log("note", `Your code is running on ${result.where ?? nodes.find((n) => n.id === boardId)?.label ?? "the board"} (${result.programBytes.toLocaleString("en-US")} bytes)`);
        });
      return;
    }
    clearPowerTimer();
    if (!hasBoard || calm()) {
      if (hasBoard) engine.click();
      begin();
      return;
    }
    setPower("plugging");
    engine.click(PLUG_CLICK_MS / 1000);
    powerTimer.current = window.setTimeout(begin, PLUG_SEATED_MS);
  }, [running, power, session, nodes, t, store, soundEngine, soundOn, hasBoard, program, programBoard, analysis, inputs]);

  const unplug = useCallback(() => {
    clearPowerTimer();
    if (calm()) {
      setPower("off");
      return;
    }
    setPower("unplugging");
    powerTimer.current = window.setTimeout(() => {
      powerTimer.current = null;
      setPower("off");
    }, UNPLUG_MS);
  }, []);

  const stopRun = useCallback(() => {
    if (programBoardRef.current) {
      program?.stop();
      programBoardRef.current = null;
      setProgramRun(null);
      setHistory(undefined);
    }
    if (power === "plugging") {
      // Stopped before the plug seated: nothing ran.
      unplug();
      return;
    }
    if (!running) return;
    setRunning(false);
    unplug();
    const result = recorder.current?.stop();
    recorder.current = null;
    if (result) {
      store.getState().log(result.draft.kind, result.draft.text);
      store.getState().addRunTime(result.ms);
    }
  }, [running, power, store, unplug, program]);
  useEffect(() => {
    stopRunRef.current = stopRun;
  }, [stopRun]);

  /** The emergency stop (SAF-01): the real board's outputs off at once and held off, then the run stops. */
  const emergencyStop = useCallback(() => {
    program?.emergencyStop?.();
    const message = "Emergency stop: the board's outputs are off and stay off. Run again to upload and start over.";
    store.getState().log("fault", message);
    setToast(message);
    stopRun();
  }, [program, store, stopRun]);
  const realRun = Boolean(programRun?.real && running);
  useEffect(() => {
    if (!realRun) return;
    // Esc stops a real board from anywhere in the window, the code editor and text fields included.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      emergencyStop();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [realRun, emergencyStop]);

  const reset = useCallback(() => {
    if (running) stopRun();
    setT(0);
    setSerial([]);
    lastSecond.current = -1;
  }, [running, stopRun]);

  // Stop the run when switching sessions.
  const sessionIdRef = useRef(session?.id);
  useEffect(() => {
    if (sessionIdRef.current !== session?.id) {
      sessionIdRef.current = session?.id;
      setRunning(false);
      clearPowerTimer();
      setPower("off");
      recorder.current = null;
      setT(0);
      setSerial([]);
      setSelectedNodes([]);
      setSelectedWire(null);
    }
  }, [session?.id]);

  // ----- actions ----------------------------------------------------------------
  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 3200);
  }, []);

  // ----- open a saved build (.kiungo.json), from the menu or dropped on the canvas
  // Kept in state (not a ref) so menus built during render may use it.
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const openFile = useCallback(
    async (file: File) => {
      if (file.size > 5_000_000) {
        showToast("That file is too large to be a lab session.");
        return;
      }
      try {
        const { session: opened, warnings } = parseSessionFile(await file.text());
        const made = onOpenBuild ? onOpenBuild(opened, file.name) : (({ name, nodes, wires }) => ({ name, nodes: nodes.length, wires: wires.length }))(store.getState().importSession(opened, file.name));
        setSelectedNodes([]);
        setSelectedWire(null);
        showToast(warnings.length ? `Opened “${made.name}” (${warnings.length} item${warnings.length === 1 ? "" : "s"} skipped)` : `Opened “${made.name}”: ${made.nodes} parts, ${made.wires} wires`);
        if (warnings.length) for (const w of warnings) store.getState().log("note", `Import: ${w}`);
        window.setTimeout(() => canvasApi?.fit?.(), 50);
      } catch (error) {
        showToast(error instanceof SessionFileError ? error.message : "Couldn't open that file.");
      }
    },
    [store, showToast, canvasApi, onOpenBuild],
  );

  const select = useCallback((ids: string[], wire: string | null = null) => {
    setSelectedNodes(ids);
    setSelectedWire(wire);
  }, []);

  const focusNode = useCallback(
    (id: string) => {
      canvasApi?.focus(id);
      setFlash([id]);
      window.setTimeout(() => setFlash([]), 1400);
    },
    [canvasApi],
  );

  const autowireNode = useCallback(
    (id: string) => {
      const s = store.getState();
      const current = s.sessions.find((x) => x.id === s.activeId);
      const node = current?.nodes.find((n) => n.id === id);
      if (!current || !node) return 0;
      const plan = planAutoWire(node, current.nodes, current.wires);
      if (!plan.board) {
        showToast("Add a board first: parts wire to a board's pins.");
        return 0;
      }
      // Skip pins that are already wired.
      const wiredPins = new Set(current.wires.flatMap((w) => [w.from, w.to]).filter((r) => r.node === id).map((r) => r.pin));
      const fresh = plan.wires.filter((w) => !wiredPins.has(w.to.pin));
      if (!fresh.length) return 0;
      const pp = getPinout(node.partId);
      // The far end is a board pin, or a breadboard rail hole ("Breadboard Top + 3").
      const far = (ref: { node: string; pin: string }) => {
        const other = current.nodes.find((n) => n.id === ref.node);
        const label = (other ? getPinout(other.partId).pins.find((p) => p.id === ref.pin)?.label : undefined) ?? ref.pin;
        return other && other.id !== plan.board!.id ? `${other.label} ${label}` : label;
      };
      const desc = fresh.map((w) => `${pp.pins.find((p) => p.id === w.to.pin)?.label ?? w.to.pin} → ${far(w.from)}`).join(", ");
      if (plan.remove?.length) s.addWires(fresh, `Put ${node.label} in series: ${desc}`, plan.remove);
      else s.addWires(fresh, `Auto-wired ${node.label} to ${plan.board.label}: ${desc}`);
      if (plan.skipped.length) showToast(`${plan.board.label} has no free pin for ${plan.skipped.join(", ")}`);
      return fresh.length;
    },
    [store, showToast],
  );

  const addPart = useCallback(
    (partId: string, opts: { at?: { x: number; y: number }; autowire?: boolean; near?: string } = {}): LabNode | null => {
      const s = store.getState();
      const current = s.sessions.find((x) => x.id === s.activeId);
      if (!current) return null;
      const board = current.nodes.find((n) => getPinout(n.partId).controller);
      const anchor = opts.near ? current.nodes.find((n) => n.id === opts.near) : board;
      const pos = opts.at ?? placeNode(partId, current.nodes, anchor);
      const node = s.addNode(partId, pos);
      if (!node) return null;
      const isBoard = getPinout(partId).controller;
      let wired = 0;
      if (opts.autowire && !isBoard) wired = autowireNode(node.id);
      setSelectedNodes([node.id]);
      setSelectedWire(null);
      // Keep the board in view with the new part, so the wires make sense.
      window.setTimeout(() => (board && !isBoard ? canvasApi?.show([board.id, node.id]) : canvasApi?.focus(node.id)), 80);
      const name = getPart(partId)?.name ?? partId;
      if (!isBoard && opts.autowire && !board) showToast(`${name} added. Add a board to wire it up.`);
      else showToast(wired ? `${node.label} added and wired to ${board?.label}` : `${node.label} added`);
      return node;
    },
    [store, autowireNode, showToast, canvasApi],
  );

  const runTemplate = useCallback(
    (id: string) => {
      const template = TEMPLATES.find((x) => x.id === id);
      if (!template) return;
      const s = store.getState();
      const current = s.sessions.find((x) => x.id === s.activeId);
      if (!current) return;
      let board = current.nodes.find((n) => getPinout(n.partId).controller);
      if (!board) board = addPart(template.board) ?? undefined;
      for (const partId of template.parts) addPart(partId, { autowire: true, near: board?.id });
      s.log("note", `Started from the “${template.title}” starter build`);
      window.setTimeout(() => canvasApi?.fit(), 350);
    },
    [store, addPart, canvasApi],
  );

  const openContextMenu = useCallback<LabContextValue["openContextMenu"]>((at, target) => setMenu({ at, target }), []);

  const ctx = useMemo<LabContextValue | null>(
    () =>
      session
        ? { session, analysis, frame, view: session.view, running, power, runtime, history: running ? history : undefined, selectedNodes, selectedWire, flash, select, focusNode, addPart, autowireNode, openContextMenu }
        : null,
    [session, analysis, frame, running, power, runtime, history, selectedNodes, selectedWire, flash, select, focusNode, addPart, autowireNode, openContextMenu],
  );

  // ----- keyboard -----------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // A code editor beside the lab handles its own keys: "/" and digits are code there, not lab shortcuts.
      if (target?.closest?.("[data-own-keys]")) return;
      const typing = !!target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        store.getState().redo();
      } else if (mod && e.key.toLowerCase() === "d" && !typing && selectedNodes.length) {
        e.preventDefault();
        select(store.getState().duplicateNodes(selectedNodes).map((n) => n.id));
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        if (running) stopRun();
        else startRun();
      } else if (!typing && !mod && e.key === "/") {
        e.preventDefault();
        setLeftOpen(true);
        window.setTimeout(() => addPanelApi?.focusSearch(), 0);
      } else if (!typing && !mod && ["1", "2", "3"].includes(e.key)) {
        store.getState().setView((["reality", "top", "flow"] as LabView[])[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, selectedNodes, select, running, startRun, stopRun, setLeftOpen, addPanelApi]);

  const exportJson = useCallback(() => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(toSessionFile(session, generator), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sessionFileName(session);
    a.click();
    URL.revokeObjectURL(url);
  }, [session, generator]);

  const startRename = useCallback(() => setRenaming(true), []);
  const chooseFile = useCallback(() => fileInput?.click(), [fileInput]);

  useImperativeHandle(
    ref,
    () => ({
      toggleRun: () => (running || power === "plugging" ? stopRun() : startRun()),
      run: () => startRun(),
      stop: () => stopRun(),
      focusSearch: () => {
        setLeftOpen(true);
        window.setTimeout(() => addPanelApi?.focusSearch(), 0);
      },
      toggleInspector: () => setRightOpen((v) => !v),
      fit: () => canvasApi?.fit(),
      setView: (view) => store.getState().setView(view),
      undo: () => store.getState().undo(),
      redo: () => store.getState().redo(),
      openFile: chooseFile,
      exportJson,
    }),
    [running, power, stopRun, startRun, setLeftOpen, setRightOpen, addPanelApi, canvasApi, store, exportJson, chooseFile],
  );

  if (!hydrated || !session || !ctx) return <LabSkeleton />;

  const errors = analysis.faults.filter((f) => f.severity === "error").length;


  const sessionMenu = titleMenu({ session, sessions, rename: startRename, openFile: chooseFile, exportJson });

  const contextItems: MenuEntry[] = (() => {
    if (!menu) return [];
    const { node: nodeId, wire: wireId, flow } = menu.target;
    if (nodeId) {
      const node = session.nodes.find((n) => n.id === nodeId);
      if (!node) return [];
      const isBoard = getPinout(node.partId).controller;
      const nodeWires = session.wires.filter((w) => w.from.node === nodeId || w.to.node === nodeId);
      const targets = selectedNodes.includes(nodeId) ? selectedNodes : [nodeId];
      return [
        { type: "label", id: "l", label: node.label },
        { id: "inspect", label: "Inspect", icon: <PanelRight />, onSelect: () => (select([nodeId]), setRightOpen(true)) },
        ...(!isBoard ? [{ id: "autowire", label: "Auto-wire to board", icon: <Wand2 />, onSelect: () => autowireNode(nodeId) }] : []),
        ...(nodeWires.length ? [{ id: "unwire", label: `Remove ${nodeWires.length} wire${nodeWires.length === 1 ? "" : "s"}`, icon: <Scissors />, onSelect: () => store.getState().removeWires(nodeWires.map((w) => w.id)) }] : []),
        { id: "dup", label: targets.length > 1 ? `Duplicate ${targets.length} parts` : "Duplicate", icon: <Copy />, shortcut: "⌘D", onSelect: () => select(store.getState().duplicateNodes(targets).map((n) => n.id)) },
        ...(host?.openPartPage ? [{ id: "library", label: "Open in Component library", icon: <BookOpen />, onSelect: () => host.openPartPage?.(node.partId) }] : []),
        { type: "separator", id: "s" },
        { id: "delete", label: targets.length > 1 ? `Delete ${targets.length} parts` : "Delete", icon: <Trash2 />, shortcut: "⌫", danger: true, onSelect: () => store.getState().removeNodes(targets) },
      ];
    }
    if (wireId) {
      return [
        { id: "inspect", label: "Inspect wire", icon: <PanelRight />, onSelect: () => (select([], wireId), setRightOpen(true)) },
        { id: "delete", label: "Delete wire", icon: <Trash2 />, shortcut: "⌫", danger: true, onSelect: () => store.getState().removeWires([wireId]) },
      ];
    }
    const quick = ["arduino-uno", "esp32", "led", "dht11", "servo", "pir"].map((id) => ({ id, label: getPart(id)?.name ?? id, onSelect: () => addPart(id, { at: flow, autowire }) }));
    return [
      { id: "add", label: "Add part here", icon: <Plus />, items: quick },
      { id: "search", label: "Search parts…", icon: <Cpu />, shortcut: "/", onSelect: () => (setLeftOpen(true), window.setTimeout(() => addPanelApi?.focusSearch(), 0)) },
      { type: "separator", id: "s" },
      { id: "fit", label: "Fit to screen", icon: <Maximize />, onSelect: () => canvasApi?.fit() },
      { id: "undo", label: "Undo", icon: <Undo2 />, shortcut: "⌘Z", disabled: !past, onSelect: () => store.getState().undo() },
      { id: "redo", label: "Redo", icon: <Redo2 />, shortcut: "⇧⌘Z", disabled: !future, onSelect: () => store.getState().redo() },
    ];
  })();

  const runtimePill = !runtime
    ? null
    : runtime === "online" || runtime === "syncing"
      ? { icon: <Server className="size-3.5" aria-hidden />, text: runtime === "syncing" ? "Saving" : "Online", tone: "text-success", title: "Connected: real boards can join this session" }
      : runtime === "checking"
        ? { icon: <Server className="size-3.5" aria-hidden />, text: "Connecting", tone: "text-muted", title: "Connecting to Kiungo" }
        : { icon: <CloudOff className="size-3.5" aria-hidden />, text: "Offline mode", tone: "text-muted", title: "Working offline. The simulation works and your sessions are saved in this browser; connecting real boards needs Kiungo online." };

  const panelLeft = (
    <AddPanel
      ref={setAddPanelApi}
      project={project}
      autowire={autowire}
      onAutowire={setAutowire}
      onTemplate={runTemplate}
      onLinkProject={
        onLinkProject
          ? () => {
              const message = onLinkProject();
              if (message) showToast(message);
            }
          : undefined
      }
    />
  );

  return (
    <LabContext.Provider value={ctx}>
      <LabHostContext.Provider value={host ?? NO_HOST}>
      <div className="hhip-lab flex h-full min-h-0 flex-col bg-background text-foreground" data-testid="engineering-lab">
        {/* Top bar */}
        <header className="relative z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-2 sm:px-3">
          {leading}
          <button type="button" onClick={() => setLeftOpen(!showLeft)} aria-pressed={showLeft} aria-label={showLeft ? "Hide components panel" : "Show components panel"} title="Components" className={cn("flex size-9 items-center justify-center rounded-[10px] transition-colors", showLeft ? "bg-muted-bg text-foreground" : "text-muted hover:bg-muted-bg")}>
            <PanelLeft className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-1">
            {renaming ? (
              <input
                autoFocus
                defaultValue={session.name}
                aria-label="Session name"
                onBlur={(e) => {
                  store.getState().renameSession(session.id, e.target.value);
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="h-9 w-56 rounded-[10px] border border-primary bg-surface px-2.5 text-sm font-semibold outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent)]"
              />
            ) : (
              <Menu label={titleMenuLabel} items={sessionMenu} buttonClassName="flex h-9 max-w-[16rem] items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-semibold text-foreground hover:bg-muted-bg" title={`${session.name}: ${titleMenuLabel.toLowerCase()}`}>
                <span className="truncate" data-testid="session-name">
                  {session.name}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden />
              </Menu>
            )}
            {projectChip}
          </div>

          <SegmentedControl value={session.view} onChange={(v) => store.getState().setView(v)} options={VIEW_OPTIONS} label="Canvas view" size="sm" className="order-last mx-auto w-full sm:order-none sm:w-auto [&_[role=radio]]:pl-3 [&_[role=radio]]:pr-5" />

          <div className="ml-auto flex items-center gap-1.5">
            {realRun ? (
              <button type="button" onClick={emergencyStop} title="Emergency stop: every output on the real board off at once (Esc)" className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#c81e1e] px-3 text-[12.5px] font-semibold text-white shadow-[0_0_0_3px_color-mix(in_srgb,#c81e1e_25%,transparent)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger" data-testid="emergency-stop">
                <OctagonX className="size-4" aria-hidden />
                Emergency stop
              </button>
            ) : null}
            <Button size="sm" onClick={running || power === "plugging" ? stopRun : startRun} variant={running ? "secondary" : "default"} className="min-w-[5.5rem]" data-testid="run-toggle" aria-busy={power === "plugging" || undefined} title={running ? "Stop (⌘↵)" : power === "plugging" ? (programRun ? "Building and loading your code…" : "Plugging in the board…") : programBoard ? "Run your code (⌘↵)" : (program?.whyNot?.(nodes) ?? "Run the default sketch (⌘↵)")}>
              {running ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
              {running ? "Stop" : power === "plugging" ? (programRun?.stage === "building" ? "Building…" : programRun ? "Loading…" : "Powering…") : "Run"}
            </Button>
            <span className="hidden w-14 text-right font-mono text-xs tabular-nums text-muted sm:inline" data-testid="sim-time" aria-label={`Simulated time ${t.toFixed(1)} seconds`}>
              {t.toFixed(1)} s
            </span>
            <div className="hidden items-center gap-0.5 md:flex">
              <button type="button" onClick={() => (running ? undefined : setT((v) => Math.round((v + 0.1) * 10) / 10))} disabled={running} title="Step 100 ms" aria-label="Step 100 ms" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground disabled:opacity-40">
                <SkipForward className="size-4" />
              </button>
              <button type="button" onClick={reset} title="Reset to 0 s" aria-label="Reset simulation" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground">
                <RotateCcw className="size-4" />
              </button>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={Boolean(programRun)} title={programRun ? "Your code runs at real time, as on the board" : undefined} aria-label="Simulation speed" className="h-8 rounded-[8px] border border-border bg-surface px-1.5 text-xs">
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
              <button type="button" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Mute buzzers" : "Turn buzzer sound on"} title={soundOn ? "Sound on: buzzers beep out loud" : "Sound off"} className={cn("flex size-8 items-center justify-center rounded-[8px] hover:bg-muted-bg", soundOn ? "text-foreground" : "text-muted")} data-testid="sound-toggle">
                {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
            </div>
            <span className="mx-1 hidden h-6 w-px bg-border md:block" aria-hidden />
            <div className="hidden items-center gap-0.5 sm:flex">
              <button type="button" onClick={() => store.getState().undo()} disabled={!past} title="Undo (⌘Z)" aria-label="Undo" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground disabled:opacity-35">
                <Undo2 className="size-4" />
              </button>
              <button type="button" onClick={() => store.getState().redo()} disabled={!future} title="Redo (⇧⌘Z)" aria-label="Redo" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground disabled:opacity-35">
                <Redo2 className="size-4" />
              </button>
            </div>
            <Menu
              label="More"
              align="end"
              buttonClassName="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground md:hidden"
              items={[
                { id: "step", label: "Step 100 ms", icon: <SkipForward />, disabled: running, onSelect: () => setT((v) => Math.round((v + 0.1) * 10) / 10) },
                { id: "reset", label: "Reset", icon: <RotateCcw />, onSelect: reset },
                { id: "speed", label: `Speed ${speed}×`, items: SPEEDS.map((s) => ({ id: String(s), label: `${s}×`, checked: s === speed, onSelect: () => setSpeed(s) })) },
                { id: "undo", label: "Undo", icon: <Undo2 />, disabled: !past, onSelect: () => store.getState().undo() },
                { id: "redo", label: "Redo", icon: <Redo2 />, disabled: !future, onSelect: () => store.getState().redo() },
              ]}
            >
              <MoreHorizontal className="size-4" />
            </Menu>
            {runtimePill ? (
              <span className={cn("hidden size-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border text-[11.5px] font-medium lg:inline-flex 2xl:w-auto 2xl:px-2.5", runtimePill.tone)} title={`${runtimePill.text}: ${runtimePill.title}`} aria-label={runtimePill.text} data-testid="runtime-status">
                {runtimePill.icon}
                <span className="hidden 2xl:inline">{runtimePill.text}</span>
              </span>
            ) : null}
            {saveStatus}
            {trailing}
            <button type="button" onClick={() => setRightOpen(!showRight)} aria-pressed={showRight} aria-label={showRight ? "Hide inspector" : "Show inspector"} title="Inspector" className={cn("flex size-9 items-center justify-center rounded-[10px] transition-colors", showRight ? "bg-muted-bg text-foreground" : "text-muted hover:bg-muted-bg")}>
              <PanelRight className="size-4" />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          {/* Left: add components */}
          {showLeft ? (
            <>
              {!wide ? <button type="button" aria-label="Close components panel" onClick={() => setLeftOpen(false)} className="absolute inset-0 z-30 bg-black/30" /> : null}
              <aside className={cn("flex w-[300px] max-w-[86vw] shrink-0 flex-col border-r border-border bg-surface", !wide && "absolute inset-y-0 left-0 z-40 shadow-[var(--shadow-md)]")} aria-label="Components">
                {panelLeft}
              </aside>
            </>
          ) : null}

          {/* Canvas */}
          <main className="relative min-h-0 min-w-0 flex-1 bg-canvas" aria-label="Circuit canvas">
            <LabCanvas ref={setCanvasApi} onDropPart={(partId, at) => addPart(partId, { at, autowire })} onDropFile={(file) => void openFile(file)} />
            <input
              ref={setFileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              data-testid="lab-open-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void openFile(file);
              }}
            />

            {session.nodes.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                <div className="pointer-events-auto w-full max-w-md rounded-[18px] border border-border bg-surface/95 p-6 text-center shadow-[var(--shadow-md)] backdrop-blur" data-testid="lab-empty">
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-primary">
                    <Cpu className="size-5" aria-hidden />
                  </div>
                  <h2 className="text-lg font-semibold">Start with a board</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">Pick a board, then add parts: they wire themselves to it. Or start from a ready-made build.</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {["arduino-uno", "esp32", "raspberry-pi-pico"].map((id) => (
                      <button key={id} type="button" onClick={() => addPart(id)} className="rounded-[12px] border border-border px-2 py-3 text-[12.5px] font-medium transition-colors hover:border-primary hover:bg-accent" data-testid={`quick-${id}`}>
                        {getPart(id)?.name.replace(" DevKit V1", "").replace("Raspberry Pi ", "")}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {TEMPLATES.map((tpl) => (
                      <button key={tpl.id} type="button" onClick={() => runTemplate(tpl.id)} className="rounded-full bg-muted-bg px-3 py-1 text-[12px] font-medium text-foreground hover:bg-accent hover:text-primary">
                        {tpl.title}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-[11.5px] text-muted">
                    Press <kbd className="rounded border border-border px-1 font-mono">/</kbd> to search parts, or drag them in from the left.
                  </p>
                  <p className="mt-1.5 text-[11.5px] text-muted">
                    Have a build file?{" "}
                    <button type="button" onClick={chooseFile} className="font-medium text-primary hover:underline" data-testid="empty-open-file">
                      Open a {SESSION_FILE_EXTENSION} file
                    </button>{" "}
                    or drop it here.
                  </p>
                </div>
              </div>
            ) : null}

            {session.view === "flow" && session.nodes.length ? (
              <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface/95 px-3 py-1.5 text-[11.5px] shadow-[var(--shadow-sm)] backdrop-blur" data-testid="flow-banner">
                <span className={cn("size-2 shrink-0 rounded-full", errors ? "bg-danger hhip-fault-pulse" : running ? "bg-success" : "bg-muted")} aria-hidden />
                <span className="font-semibold text-foreground">{errors ? `${errors} fault${errors === 1 ? "" : "s"} stopping current` : running ? "Current flowing" : "Stopped"}</span>
                <span className="hidden truncate text-muted sm:inline">{errors ? "Dashed red wires show where" : running ? "Dots show current and data; dim wires are idle" : "Press Run to start the sketch"}</span>
              </div>
            ) : null}

            {toast ? (
              <div role="status" className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-foreground px-3.5 py-1.5 text-[12.5px] font-medium text-background shadow-[var(--shadow-md)] hhip-menu-pop" data-testid="lab-toast">
                {toast}
              </div>
            ) : null}
          </main>

          {/* Right: inspector */}
          {showRight ? (
            <>
              {!xl ? <button type="button" aria-label="Close inspector" onClick={() => setRightOpen(false)} className="absolute inset-0 z-30 bg-black/20 xl:hidden" /> : null}
              <aside className={cn("hhip-scroll w-[320px] max-w-[88vw] shrink-0 overflow-y-auto border-l border-border bg-surface", !xl && "absolute inset-y-0 right-0 z-40 shadow-[var(--shadow-md)]")} aria-label="Inspector">
                <Inspector />
              </aside>
            </>
          ) : null}
        </div>

        <LabDock
          tab={dockTab}
          onTab={setDockTab}
          open={dockOpen}
          onOpen={setDockOpen}
          height={dockHeight}
          onHeight={setDockHeight}
          serial={serial}
          onClearSerial={() => setSerial([])}
          terminalApi={{
            session,
            analysis,
            frame,
            running,
            addPart: (partId, wire) => addPart(partId, { autowire: wire }),
            removeNodes: (ids) => store.getState().removeNodes(ids),
            addWire: (a, b) => store.getState().addWire(a, b),
            autowire: autowireNode,
            unwire: (id) => {
              const ws = session.wires.filter((w) => w.from.node === id || w.to.node === id);
              store.getState().removeWires(ws.map((w) => w.id));
              return ws.length;
            },
            run: startRun,
            stop: stopRun,
            step: () => setT((v) => Math.round((v + 0.1) * 10) / 10),
            reset,
            setView: (v) => store.getState().setView(v),
          }}
        />

        <ContextMenu at={menu?.at ?? null} items={contextItems} onClose={() => setMenu(null)} />
      </div>
      </LabHostContext.Provider>
    </LabContext.Provider>
  );
});

const NO_HOST: LabHost = {};
