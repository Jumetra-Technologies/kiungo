"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Analysis, Fault } from "@kiungo/core/lab/circuit";
import type { Frame } from "@kiungo/core/lab/simulate";
import type { PeripheralInput } from "@kiungo/core/emulator/peripherals";
import type { ProgramReadings } from "@kiungo/core/lab/program";
import type { PowerState } from "./UsbCable";
import type { LabNode, LabSession, LabView, LabWire } from "@kiungo/core/lab/types";

/** The website's link to Kiungo online: checking, connected, saving the mirror, or offline. */
export type RuntimeStatus = "checking" | "online" | "offline" | "syncing";

/**
 * What the app hosting the lab adds around it. The website links parts to the
 * Component library and lists real boards; the desktop app has neither yet.
 */
export interface LabHost {
  /** A link to a part's page, wrapped around `children`. Omit where there is no library. */
  renderPartLink?: (partId: string, children: ReactNode, className: string) => ReactNode;
  /** Go to a part's page (the canvas menu). */
  openPartPage?: (partId: string) => void;
  /** The Inspector's "Real hardware" section. Omitted: the section is hidden. */
  realHardware?: ReactNode;
  /** What the Inspector's Mode setting does in this app, under the setting. Omitted: the website's wording. */
  modeNote?: (node: LabNode) => string;
}

export const LabHostContext = createContext<LabHost>({});

export function useLabHost(): LabHost {
  return useContext(LabHostContext);
}

/**
 * Runs the user's compiled program on an emulated board (the desktop app).
 * The lab asks which board runs it, starts it on Run, and keeps its
 * sensors' readings flowing to it.
 */
export interface ProgramDriver {
  /** The board node that runs the program, or null: Run then runs the built-in behavior and says why in `whyNot`. */
  boardFor: (nodes: LabNode[]) => string | null;
  /** Why no board runs the program (no Uno in the circuit, a board that isn't emulated yet), for the Run button's title. */
  whyNot?: (nodes: LabNode[]) => string | null;
  /** Build if needed, load and start. Resolves once it's running, or with why it can't. */
  start: (
    boardId: string,
    /** What its sensors read as it starts, so the first reading isn't missed. */
    inputs: PeripheralInput[],
    /** The circuit as it is now: a robot's wheels and sensors come from it. */
    circuit: { nodes: LabNode[]; analysis: Analysis },
    on: {
      readings: (r: ProgramReadings) => void;
      serial: (text: string) => void;
      stage: (stage: "building" | "starting") => void;
      /** The run ended by itself (a real board unplugged, its link lost): the lab stops and says why. */
      ended?: (message: string) => void;
    },
  ) => Promise<
    | {
        ok: true;
        programBytes: number;
        /** Where it runs, for the log: "the real Arduino Uno on COM3". */
        where?: string;
        /** The code runs on a real board: the lab shows the emergency stop. */
        real?: boolean;
      }
    | { ok: false; message: string }
  >;
  stop: () => void;
  /** What the board's sensors read now. */
  setInputs: (inputs: PeripheralInput[]) => void;
  /** Text typed in the lab's serial monitor. */
  sendSerial?: (text: string) => void;
  /** Extra problems for the circuit as the host runs it (a real board's electrical checks), shown with the lab's own. */
  faults?: (circuit: { nodes: LabNode[]; wires: LabWire[]; analysis: Analysis }) => Fault[];
  /** Turn every output of a real board off at once and keep it off (SAF-01). Only for runs that say `real`. */
  emergencyStop?: () => void;
}

export interface LabContextValue {
  session: LabSession;
  analysis: Analysis;
  frame: Frame;
  view: LabView;
  running: boolean;
  /** The boards' USB leads: plugged in while the sketch runs. */
  power: PowerState;
  /** Kiungo online, where the host has it; undefined in the desktop app. */
  runtime?: RuntimeStatus;
  /** Pin levels over the last few seconds of a program run, for the Signals traces (the emulator can't be sampled after the fact). */
  history?: Array<{ t: number; pins: Record<string, number> }>;
  selectedNodes: string[];
  selectedWire: string | null;
  /** Nodes to flash briefly (after clicking a fault). */
  flash: string[];
  select: (nodes: string[], wire?: string | null) => void;
  focusNode: (id: string) => void;
  addPart: (partId: string, opts?: { at?: { x: number; y: number }; autowire?: boolean; near?: string }) => LabNode | null;
  autowireNode: (id: string) => number;
  openContextMenu: (at: { x: number; y: number }, target: { node?: string; wire?: string; flow?: { x: number; y: number } }) => void;
}

export const LabContext = createContext<LabContextValue | null>(null);

export function useLabContext(): LabContextValue {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error("useLabContext must be used inside the Engineering Lab");
  return ctx;
}
