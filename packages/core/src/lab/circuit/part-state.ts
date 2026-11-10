import type { LabPin, Pinout } from "../pinout";
import type { LabNode, PinRef } from "../types";
import type { BoardLink, Fault, Net, Severity } from "./types";

/** What the checks learn about one part as they go through its pins. */
export interface PartState {
  node: LabNode;
  pinout: Pinout;
  name: string;
  /** Pins of this part with at least one wire. */
  wired: Set<string>;
  links: BoardLink[];
  faults: Fault[];
  supplyV: number | null;
  poweredByRail: boolean;
  grounded: boolean;
  driven: boolean;
  /** The voltage on the part's drive pin when it is on: a rail's, or the board's logic level. */
  driveV: number | null;
  /** Resistance met on the way to the drive pin and to ground. */
  seriesOhms: number;
}

/** One pin of the part, the net it reaches and the board pin on that net, if any. */
export interface PinView {
  pin: LabPin;
  net: Net;
  boardRef?: PinRef;
  boardPin?: LabPin;
  board?: Pinout;
  boardName: string;
  isWired: boolean;
}

/** A pin that reaches a board's signal pin. */
export interface OnBoard extends PinView {
  boardRef: PinRef;
  boardPin: LabPin;
  board: Pinout;
}

export function newPartState(
  node: LabNode,
  pinout: Pinout,
  name: string,
  wired: Set<string>,
): PartState {
  return {
    node,
    pinout,
    name,
    wired,
    links: [],
    faults: [],
    supplyV: null,
    poweredByRail: false,
    grounded: false,
    driven: false,
    driveV: null,
    seriesOhms: 0,
  };
}

export function fault(
  s: PartState,
  {
    severity,
    key,
    title,
    detail,
    extraNodes = [],
    netWires = [],
  }: {
    severity: Severity;
    key: string;
    title: string;
    detail: string;
    extraNodes?: string[];
    netWires?: string[];
  },
) {
  s.faults.push({
    id: `${key}:${s.node.id}`,
    severity,
    title,
    detail,
    nodes: [s.node.id, ...extraNodes],
    wires: netWires,
  });
}

export const onBoard = (v: PinView): v is OnBoard => Boolean(v.boardRef && v.boardPin && v.board);
