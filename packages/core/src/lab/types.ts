/**
 * The Engineering Lab's own model of a build.
 *
 * A lab session is what a person is building: the parts on the canvas, the
 * wires between their pins and a log of what happened. Sessions live in the
 * browser so the lab opens instantly and keeps working without the backend;
 * when the backend is reachable a session is mirrored to it as a runtime.
 */

export type LabView = "reality" | "top" | "flow";

export type DeviceMode = "virtual" | "physical" | "hybrid";

export interface LabNode {
  id: string;
  /** Part id from `lib/parts` (also the backend catalog id). */
  partId: string;
  label: string;
  x: number;
  y: number;
  mode: DeviceMode;
}

export interface PinRef {
  node: string;
  pin: string;
}

export interface LabWire {
  id: string;
  from: PinRef;
  to: PinRef;
  /** A color the person picked; otherwise the color of the net's kind. */
  color?: string;
}

export type LogKind = "session" | "build" | "wire" | "run" | "state" | "fault" | "fix" | "note";

export interface LogEntry {
  id: string;
  at: string;
  kind: LogKind;
  text: string;
  /** Nodes the entry is about, so the lab can point at them. */
  nodes?: string[];
}

/**
 * What a person has set on a part: a sensor's surroundings (the obstacle
 * distance, the temperature), a command to an actuator (motor speed), or a
 * board's sketch settings (blink delay, warning distance). Keys and ranges
 * are declared per part in `lib/lab/controls.ts`.
 */
export type NodeInputs = Record<string, number | string | boolean>;

export interface LabSession {
  id: string;
  name: string;
  /** A Projects-page project this session belongs to. */
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  nodes: LabNode[];
  wires: LabWire[];
  log: LogEntry[];
  view: LabView;
  /** Total simulated run time, for the project summary. */
  runMs: number;
  /** Inputs, commands and sketch settings by node id. Absent for sessions saved before 1.3. */
  inputs?: Record<string, NodeInputs>;
  /** Backend workspace mirroring this session, when one exists. */
  runtime?: { workspaceId: string; nodeIds: Record<string, string>; wireIds: Record<string, string> } | null;
}

export interface LabData {
  version: 1;
  sessions: LabSession[];
  activeId: string | null;
}
