"use client";

/**
 * Lab sessions: the circuit being built, with undo and redo.
 *
 * Where sessions are kept is up to the host (`setLabPersistence`). On the
 * website each signed-in account's sessions are cached separately in this
 * browser and synchronized to its server records; signed out, they live in
 * memory only, and the old shared, account-less key is cleared. The desktop
 * app keeps the open project's circuit in its project folder.
 */

import { create } from "zustand";
import { SOURCE_KEY, SOURCE_SET, coerceInput, findControl, inputOf } from "@kiungo/core/lab/controls";
import { getPinout } from "@kiungo/core/lab/pinout";
import { getPart } from "@kiungo/core/parts";
import { logEntry, makeId, newSession, nextLabel } from "@kiungo/core/lab/session";
import { stepperStepsAt } from "@kiungo/core/lab/simulate";
import type { DeviceMode, LabData, LabNode, LabSession, LabView, LabWire, LogKind, NodeInputs, PinRef } from "@kiungo/core/lab/types";

export { logEntry, makeId, newSession, nextLabel, shortName } from "@kiungo/core/lab/session";

/** The old key every visitor shared; cleared, never written. */
export const LAB_STORAGE_KEY = "hhip.lab:v1";
/** Per-account key: this plus the account id. */
export const LAB_ACCOUNT_KEY_PREFIX = "kiungo.lab:v2:";
export const labKeyFor = (accountId: string) => `${LAB_ACCOUNT_KEY_PREFIX}${accountId}`;
const MAX_LOG = 400;
const MAX_HISTORY = 60;
let labData: LabData = { version: 1, sessions: [], activeId: null };
/** The signed-in account whose sessions are open, or null (memory only). */
let owner: string | null = null;

const now = () => new Date().toISOString();

function clearLegacyLabData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAB_STORAGE_KEY);
  } catch (error) {
    console.error("Could not clear previously stored lab sessions.", error);
  }
}

/** One step of undo history: the canvas before (or after) a change. */
export type LabSnapshot = { nodes: LabNode[]; wires: LabWire[] };

/** Undo and redo for the open session, for hosts that keep it with the work (DSK-13). */
export interface LabHistory {
  past: LabSnapshot[];
  future: LabSnapshot[];
}

/**
 * Where the lab keeps its sessions. `read` runs when the lab hydrates; `write`
 * runs `delayMs` after the last change, and again on `flushLab`. A host that
 * keeps history (`keepsHistory`) is given the undo stack with each write and
 * can return it from `readHistory`.
 */
export interface LabPersistence {
  read: () => LabData;
  /** Keep the sessions; false when they couldn't be kept (storage full or blocked). */
  write: (data: LabData, history: LabHistory) => boolean;
  delayMs: number;
  readHistory?: () => LabHistory | null;
  /** Follow changes made elsewhere (another tab); returns a stop function. */
  watch?: (onChange: () => void) => () => void;
}

function sanitize(raw: unknown): LabData {
  const empty: LabData = { version: 1, sessions: [], activeId: null };
  if (!raw || typeof raw !== "object") return empty;
  const data = raw as Partial<LabData>;
  const sessions = Array.isArray(data.sessions)
    ? data.sessions
        .filter((s): s is LabSession => !!s && typeof s === "object" && typeof (s as LabSession).id === "string")
        .map((s) => ({
          ...s,
          name: typeof s.name === "string" ? s.name : "Untitled lab",
          projectId: typeof s.projectId === "string" ? s.projectId : null,
          nodes: Array.isArray(s.nodes) ? s.nodes : [],
          wires: Array.isArray(s.wires) ? s.wires : [],
          log: Array.isArray(s.log) ? s.log : [],
          view: (s.view === "reality" || s.view === "flow" ? s.view : "top") as LabView,
          runMs: Number(s.runMs) || 0,
          inputs: s.inputs && typeof s.inputs === "object" ? s.inputs : {},
        }))
    : [];
  return { version: 1, sessions, activeId: typeof data.activeId === "string" ? data.activeId : null };
}

function readBrowserLabData(): LabData {
  clearLegacyLabData();
  if (owner && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(labKeyFor(owner));
      labData = raw ? sanitize(JSON.parse(raw)) : { version: 1, sessions: [], activeId: null };
    } catch {
      /* unreadable: keep what's in memory */
    }
  }
  return labData;
}

/** Keep the sessions; returns false when the browser refused to store them (full or blocked). */
function writeBrowserLabData(data: LabData): boolean {
  clearLegacyLabData();
  labData = sanitize(data);
  if (!owner || typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(labKeyFor(owner), JSON.stringify(labData));
    return true;
  } catch {
    return false;
  }
}

/** The website's persistence: per account in this browser, memory only when signed out. */
export const browserLabPersistence: LabPersistence = {
  read: readBrowserLabData,
  write: (data) => writeBrowserLabData(data),
  delayMs: 200,
  watch: (onChange) => {
    if (typeof window === "undefined") return () => undefined;
    const listener = (event: StorageEvent) => {
      if (owner && event.key === labKeyFor(owner)) onChange();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  },
};

let persistence: LabPersistence = browserLabPersistence;
let stopWatching: (() => void) | null = null;

export function readLabData(): LabData {
  return persistence.read();
}

/** Keep the sessions; returns false when they couldn't be kept (full or blocked). */
export function writeLabData(data: LabData): boolean {
  const state = useLab.getState();
  return persistence.write(sanitize(data), { past: state.past, future: state.future });
}

/** Whose sessions are open: the signed-in account's id, or null. */
export function labOwner(): string | null {
  return owner;
}

export interface LabState {
  hydrated: boolean;
  saveError: boolean;
  cloudSaveState: "idle" | "syncing" | "saved" | "error";
  sessions: LabSession[];
  activeId: string | null;
  past: LabSnapshot[];
  future: LabSnapshot[];

  hydrate: () => void;
  createSession: (input?: Parameters<typeof newSession>[0]) => LabSession;
  openSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  linkProject: (id: string, projectId: string | null, projectName?: string) => void;
  duplicateSession: (id: string) => LabSession | null;
  /** Open a session read from a `.kiungo.json` file (see `session-file.ts`) as a new session. */
  importSession: (session: LabSession, source?: string) => LabSession;
  /** Put a whole build (a file's parts, wires and settings) into the open session, as one undo step. */
  replaceBuild: (build: Pick<LabSession, "nodes" | "wires" | "inputs">, source?: string) => void;
  deleteSession: (id: string) => void;
  setView: (view: LabView) => void;
  addNode: (partId: string, at?: { x: number; y: number }, label?: string) => LabNode | null;
  moveNode: (id: string, x: number, y: number) => void;
  renameNode: (id: string, label: string) => void;
  setNodeMode: (id: string, mode: DeviceMode) => void;
  removeNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[]) => LabNode[];
  addWire: (from: PinRef, to: PinRef, opts?: { silent?: boolean }) => LabWire | null;
  /** Add wires in one undo step; `replace` lists wires to take out in the same step (a resistor going in series). */
  addWires: (wires: Array<{ from: PinRef; to: PinRef }>, summary?: string, replace?: string[]) => LabWire[];
  removeWires: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  log: (kind: LogKind, text: string, nodes?: string[]) => void;
  addRunTime: (ms: number) => void;
  setRuntime: (runtime: LabSession["runtime"]) => void;
  /**
   * Set a sensor's surroundings, an actuator's command or a board's sketch setting. Out-of-range
   * numbers are clamped; values that aren't numbers, or options that don't exist, are ignored.
   * `t` is the lab's clock: a stepper's speed change takes effect from there, mid-move.
   */
  setInput: (nodeId: string, key: string, value: number | string | boolean, t?: number) => void;
  /** Back to the defaults (the simulated sweep for sensors). */
  clearInputs: (nodeId: string) => void;
  /** Tell a stepper to move `steps` (negative for anticlockwise) from where it is at simulated time t; 0 holds. */
  commandStepper: (nodeId: string, steps: number, t: number) => void;
  /** Make the stepper's current position its zero. */
  zeroStepper: (nodeId: string, t: number) => void;
}

export const useLab = create<LabState>((set, get) => {
  const active = () => get().sessions.find((s) => s.id === get().activeId) ?? null;

  /** Change the open session, keeping history for undo when the canvas changes. */
  const update = (fn: (s: LabSession) => LabSession, opts: { history?: boolean } = {}) => {
    const current = active();
    if (!current) return;
    const next = { ...fn(current), updatedAt: now() };
    if (next.log.length > MAX_LOG) next.log = next.log.slice(-MAX_LOG);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === current.id ? next : s)),
      ...(opts.history ? { past: [...state.past.slice(-MAX_HISTORY + 1), { nodes: current.nodes, wires: current.wires }], future: [] } : {}),
    }));
  };

  const updateById = (id: string, fn: (s: LabSession) => LabSession) =>
    set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? { ...fn(s), updatedAt: now() } : s)) }));

  return {
    hydrated: false,
    saveError: false,
    cloudSaveState: "idle",
    sessions: [],
    activeId: null,
    past: [],
    future: [],

    hydrate: () => {
      const data = readLabData();
      const history = persistence.readHistory?.() ?? null;
      set({
        hydrated: true,
        sessions: data.sessions,
        activeId: data.activeId && data.sessions.some((s) => s.id === data.activeId) ? data.activeId : (data.sessions[0]?.id ?? null),
        past: history?.past.slice(-MAX_HISTORY) ?? [],
        future: history?.future.slice(0, MAX_HISTORY) ?? [],
      });
    },

    createSession: (input) => {
      const session = newSession(input);
      set((state) => ({ sessions: [session, ...state.sessions], activeId: session.id, past: [], future: [] }));
      return session;
    },

    openSession: (id) => {
      if (get().activeId === id) return;
      if (!get().sessions.some((s) => s.id === id)) return;
      set({ activeId: id, past: [], future: [] });
    },

    renameSession: (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      updateById(id, (s) => (s.name === clean ? s : { ...s, name: clean, log: [...s.log, logEntry("note", `Renamed to “${clean}”`)] }));
    },

    linkProject: (id, projectId, projectName) =>
      updateById(id, (s) => ({ ...s, projectId, log: [...s.log, logEntry("note", projectId ? `Linked to project “${projectName ?? "project"}”` : "Unlinked from its project")] })),

    duplicateSession: (id) => {
      const source = get().sessions.find((s) => s.id === id);
      if (!source) return null;
      const copy: LabSession = { ...newSession({ name: `${source.name} (copy)`, projectId: source.projectId }), nodes: source.nodes.map((n) => ({ ...n })), wires: source.wires.map((w) => ({ ...w })), view: source.view };
      set((state) => ({ sessions: [copy, ...state.sessions], activeId: copy.id, past: [], future: [] }));
      return copy;
    },

    importSession: (session, source) => {
      const taken = new Set(get().sessions.map((s) => s.id));
      const id = taken.has(session.id) ? makeId("lab") : session.id;
      const opened: LabSession = { ...session, id, runtime: null, updatedAt: now(), log: [...session.log, logEntry("session", `Opened from ${source ?? "a file"}`)] };
      set((state) => ({ sessions: [opened, ...state.sessions], activeId: opened.id, past: [], future: [] }));
      return opened;
    },

    replaceBuild: (build, source) =>
      update(
        (s) => ({
          ...s,
          nodes: build.nodes,
          wires: build.wires,
          inputs: build.inputs ?? {},
          runtime: null,
          log: [...s.log, logEntry("session", `Opened the build from ${source ?? "a file"}: ${build.nodes.length} parts, ${build.wires.length} wires`)],
        }),
        { history: true },
      ),

    deleteSession: (id) =>
      set((state) => {
        const sessions = state.sessions.filter((s) => s.id !== id);
        return { sessions, activeId: state.activeId === id ? (sessions[0]?.id ?? null) : state.activeId, ...(state.activeId === id ? { past: [], future: [] } : {}) };
      }),

    setView: (view) => update((s) => ({ ...s, view })),

    addNode: (partId, at, label) => {
      const session = active();
      if (!session) return null;
      const part = getPart(partId);
      const node: LabNode = {
        id: makeId("n"),
        partId,
        label: label ?? nextLabel(session.nodes, partId),
        x: Math.round(at?.x ?? 80),
        y: Math.round(at?.y ?? 80),
        mode: "virtual",
      };
      update((s) => ({ ...s, nodes: [...s.nodes, node], log: [...s.log, logEntry("build", `Added ${node.label}${part ? "" : ` (${partId})`}`, [node.id])] }), { history: true });
      return node;
    },

    moveNode: (id, x, y) => {
      const node = active()?.nodes.find((n) => n.id === id);
      if (!node || (Math.round(node.x) === Math.round(x) && Math.round(node.y) === Math.round(y))) return;
      update((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) }), { history: true });
    },

    renameNode: (id, label) => {
      const clean = label.trim();
      if (!clean) return;
      update((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, label: clean } : n)) }), { history: true });
    },

    setNodeMode: (id, mode) => {
      const node = active()?.nodes.find((n) => n.id === id);
      if (!node || node.mode === mode) return;
      update((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, mode } : n)), log: [...s.log, logEntry("build", `${node.label} set to ${mode}`, [id])] }), { history: true });
    },

    removeNodes: (ids) => {
      const session = active();
      if (!session || !ids.length) return;
      const gone = session.nodes.filter((n) => ids.includes(n.id));
      if (!gone.length) return;
      update(
        (s) => ({
          ...s,
          nodes: s.nodes.filter((n) => !ids.includes(n.id)),
          wires: s.wires.filter((w) => !ids.includes(w.from.node) && !ids.includes(w.to.node)),
          inputs: Object.fromEntries(Object.entries(s.inputs ?? {}).filter(([id]) => !ids.includes(id))),
          log: [...s.log, logEntry("build", `Removed ${gone.map((n) => n.label).join(", ")}`)],
        }),
        { history: true },
      );
    },

    duplicateNodes: (ids) => {
      const session = active();
      if (!session) return [];
      const copies: LabNode[] = [];
      const copiedInputs: Record<string, NodeInputs> = {};
      let pool = [...session.nodes];
      for (const node of session.nodes.filter((n) => ids.includes(n.id))) {
        const copy = { ...node, id: makeId("n"), label: nextLabel(pool, node.partId), x: node.x + 40, y: node.y + 40 };
        copies.push(copy);
        if (session.inputs?.[node.id]) copiedInputs[copy.id] = { ...session.inputs[node.id] };
        pool = [...pool, copy];
      }
      if (!copies.length) return [];
      update((s) => ({ ...s, nodes: [...s.nodes, ...copies], inputs: { ...(s.inputs ?? {}), ...copiedInputs }, log: [...s.log, logEntry("build", `Duplicated ${copies.map((c) => c.label).join(", ")}`, copies.map((c) => c.id))] }), { history: true });
      return copies;
    },

    setInput: (nodeId, key, value, t) => {
      const session = active();
      const node = session?.nodes.find((n) => n.id === nodeId);
      if (!session || !node) return;
      const control = findControl(node.partId, key);
      const next = control ? coerceInput(control, value) : typeof value === "number" && !Number.isFinite(value) ? null : value;
      if (next === null) return;
      if (session.inputs?.[nodeId]?.[key] === next) return;
      // Changing a value is taking it over; the Input switch itself is set explicitly.
      const takeOver: NodeInputs = key !== SOURCE_KEY && control && findControl(node.partId, SOURCE_KEY) ? { [SOURCE_KEY]: SOURCE_SET } : {};
      // A stepper's move is worked out from where it started at what speed. Changing the speed mid-move
      // restarts the rest of the move from where the shaft is now, so the position doesn't jump.
      const reanchor: NodeInputs =
        node.partId === "stepper-motor" && key === "stepsPerSecond" && t !== undefined && session.inputs?.[nodeId]?.[SOURCE_KEY] === SOURCE_SET
          ? { cmdFrom: stepperStepsAt(session.inputs, nodeId, t), cmdAt: t, cmdTarget: inputOf(session.inputs, nodeId, "cmdTarget", inputOf(session.inputs, nodeId, "cmdFrom", 0)) }
          : {};
      update((s) => ({ ...s, inputs: { ...(s.inputs ?? {}), [nodeId]: { ...(s.inputs?.[nodeId] ?? {}), ...takeOver, ...reanchor, [key]: next } } }));
    },

    clearInputs: (nodeId) => {
      const session = active();
      if (!session?.inputs?.[nodeId]) return;
      update((s) => ({ ...s, inputs: Object.fromEntries(Object.entries(s.inputs ?? {}).filter(([id]) => id !== nodeId)) }));
    },

    commandStepper: (nodeId, steps, t) => {
      const session = active();
      const node = session?.nodes.find((n) => n.id === nodeId);
      if (!session || !node || node.partId !== "stepper-motor" || !Number.isFinite(steps)) return;
      const current = session.inputs?.[nodeId]?.[SOURCE_KEY] === SOURCE_SET ? stepperStepsAt(session.inputs, nodeId, t) : 0;
      const move = Math.round(steps);
      update((s) => ({
        ...s,
        // Go records the move (cmdStart → cmdGoal) for the Inspector; Stop (0) holds where the shaft is
        // and keeps that record, so it reads "stopped at 750 of 2000" rather than finishing the move.
        inputs: { ...(s.inputs ?? {}), [nodeId]: { ...(s.inputs?.[nodeId] ?? {}), [SOURCE_KEY]: SOURCE_SET, cmdFrom: current, cmdTarget: current + move, cmdAt: t, ...(move ? { cmdStart: current, cmdGoal: current + move } : {}) } },
        log: move ? [...s.log, logEntry("run", `${node.label}: move ${Math.abs(move)} steps ${move > 0 ? "clockwise" : "anticlockwise"}`, [nodeId])] : s.log,
      }));
    },

    zeroStepper: (nodeId, t) => {
      const session = active();
      const node = session?.nodes.find((n) => n.id === nodeId);
      if (!session || !node || node.partId !== "stepper-motor") return;
      update((s) => ({ ...s, inputs: { ...(s.inputs ?? {}), [nodeId]: { ...(s.inputs?.[nodeId] ?? {}), [SOURCE_KEY]: SOURCE_SET, cmdFrom: 0, cmdStart: 0, cmdGoal: 0, cmdTarget: 0, cmdAt: t } } }));
    },

    addWire: (from, to, opts) => {
      const session = active();
      if (!session) return null;
      if (from.node === to.node && from.pin === to.pin) return null;
      const exists = session.wires.some((w) => (w.from.node === from.node && w.from.pin === from.pin && w.to.node === to.node && w.to.pin === to.pin) || (w.from.node === to.node && w.from.pin === to.pin && w.to.node === from.node && w.to.pin === from.pin));
      if (exists) return null;
      const a = session.nodes.find((n) => n.id === from.node);
      const b = session.nodes.find((n) => n.id === to.node);
      if (!a || !b) return null;
      const wire: LabWire = { id: makeId("w"), from, to };
      const pa = getPinout(a.partId).pins.find((p) => p.id === from.pin);
      const pb = getPinout(b.partId).pins.find((p) => p.id === to.pin);
      const text = `Wired ${a.label} ${pa?.label ?? from.pin} → ${b.label} ${pb?.label ?? to.pin}`;
      update((s) => ({ ...s, wires: [...s.wires, wire], log: opts?.silent ? s.log : [...s.log, logEntry("wire", text, [a.id, b.id])] }), { history: true });
      return wire;
    },

    addWires: (list, summary, replace = []) => {
      const session = active();
      if (!session || !list.length) return [];
      const made: LabWire[] = list.map((w) => ({ id: makeId("w"), from: w.from, to: w.to }));
      const nodes = [...new Set(list.flatMap((w) => [w.from.node, w.to.node]))];
      update((s) => ({ ...s, wires: [...s.wires.filter((w) => !replace.includes(w.id)), ...made], log: summary ? [...s.log, logEntry("wire", summary, nodes)] : s.log }), { history: true });
      return made;
    },

    removeWires: (ids) => {
      const session = active();
      if (!session || !ids.length) return;
      const count = session.wires.filter((w) => ids.includes(w.id)).length;
      if (!count) return;
      update((s) => ({ ...s, wires: s.wires.filter((w) => !ids.includes(w.id)), log: [...s.log, logEntry("wire", count === 1 ? "Removed a wire" : `Removed ${count} wires`)] }), { history: true });
    },

    undo: () => {
      const { past, future } = get();
      const current = active();
      if (!current || !past.length) return;
      const prev = past[past.length - 1];
      set((state) => ({
        past: past.slice(0, -1),
        future: [{ nodes: current.nodes, wires: current.wires }, ...future].slice(0, MAX_HISTORY),
        sessions: state.sessions.map((s) => (s.id === current.id ? { ...s, nodes: prev.nodes, wires: prev.wires, updatedAt: now() } : s)),
      }));
    },

    redo: () => {
      const { past, future } = get();
      const current = active();
      if (!current || !future.length) return;
      const next = future[0];
      set((state) => ({
        future: future.slice(1),
        past: [...past, { nodes: current.nodes, wires: current.wires }].slice(-MAX_HISTORY),
        sessions: state.sessions.map((s) => (s.id === current.id ? { ...s, nodes: next.nodes, wires: next.wires, updatedAt: now() } : s)),
      }));
    },

    log: (kind, text, nodes) => update((s) => ({ ...s, log: [...s.log, logEntry(kind, text, nodes)] })),

    addRunTime: (ms) => update((s) => ({ ...s, runMs: s.runMs + Math.max(0, Math.round(ms)) })),

    setRuntime: (runtime) => update((s) => ({ ...s, runtime })),
  };
});

/** Save shortly after any change, and follow changes made elsewhere. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save(): void {
  const state = useLab.getState();
  const ok = writeLabData({ version: 1, sessions: state.sessions, activeId: state.activeId });
  if (ok === useLab.getState().saveError) useLab.setState({ saveError: !ok });
}

function followOutsideChanges(): void {
  stopWatching?.();
  stopWatching =
    persistence.watch?.(() => {
      if (!useLab.getState().hydrated) return;
      const data = readLabData();
      const { activeId } = useLab.getState();
      useLab.setState({ sessions: data.sessions, activeId: activeId && data.sessions.some((s) => s.id === activeId) ? activeId : (data.sessions[0]?.id ?? null) });
    }) ?? null;
}

if (typeof window !== "undefined") {
  useLab.subscribe((state, prev) => {
    if (!state.hydrated) return;
    if (state.sessions === prev.sessions && state.activeId === prev.activeId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save();
    }, persistence.delayMs);
  });
  followOutsideChanges();
}

/** Write any pending change now (before navigating away, say). */
export function flushLab() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (useLab.getState().hydrated) save();
}

/**
 * Keep sessions somewhere else (the desktop app's project folder). Pending
 * changes are written to the old place first; the lab then empties and waits
 * for `hydrate`, which reads from the new one.
 */
export function setLabPersistence(next: LabPersistence): void {
  if (next === persistence) return;
  flushLab();
  persistence = next;
  useLab.setState({ hydrated: false, sessions: [], activeId: null, past: [], future: [], saveError: false, cloudSaveState: "idle" });
  if (typeof window !== "undefined") followOutsideChanges();
}

/**
 * Switch to another account's sessions (sign-in, sign-out, switching
 * account). Pending changes are saved to the account they belong to first,
 * and nothing from one account is shown to another.
 */
export function setLabOwner(accountId: string | null): void {
  if (accountId === owner) return;
  flushLab();
  owner = accountId;
  labData = { version: 1, sessions: [], activeId: null };
  if (accountId) labData = readBrowserLabData();
  if (useLab.getState().hydrated) {
    const data = labData;
    useLab.setState({ sessions: data.sessions, activeId: data.activeId && data.sessions.some((s) => s.id === data.activeId) ? data.activeId : (data.sessions[0]?.id ?? null), past: [], future: [], saveError: false, cloudSaveState: "idle" });
  }
}

export function useActiveSession(): LabSession | null {
  return useLab((s) => s.sessions.find((x) => x.id === s.activeId) ?? null);
}
