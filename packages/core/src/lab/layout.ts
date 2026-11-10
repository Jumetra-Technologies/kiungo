/**
 * Geometry of a part on the lab canvas, shared by the renderer (pin handles)
 * and by placement (so new parts land in free space).
 */

import { boardBox, boardGeometry, type BoardGeometry } from "./board-geometry";
import { getPart } from "../parts";
import { getPinout, type LabPin } from "./pinout";
import type { LabView } from "./types";

export const NODE = {
  header: 46,
  row: 18,
  padTop: 8,
  padBottom: 12,
  railLabel: 88,
  boardWidth: 340,
  partWidth: 252,
  minRowsBoard: 10,
  minRowsPart: 5,
} as const;

export interface NodeLayout {
  w: number;
  h: number;
  rows: number;
  left: LabPin[];
  right: LabPin[];
  /** Graphic slot between the rails. */
  slot: { x: number; y: number; w: number; h: number };
  /** Set when the part is drawn as itself, with wires on its real pins (no card, no rails). */
  bare?: BoardGeometry;
}

export function pinY(index: number): number {
  return NODE.header + NODE.padTop + index * NODE.row + NODE.row / 2;
}

/**
 * A part's box and pin positions on the canvas. Boards with a canvas spec are
 * drawn bare in the 3D and 2D views (`view` decides); a breadboard is bare in
 * every view, Trace included. Everything else is a card with pin rails.
 */
export function nodeLayout(partId: string, view?: LabView): NodeLayout {
  const pinout = getPinout(partId);
  // Parts that are always drawn as themselves (a breadboard) never get a card, view or not.
  const always = !!getPart(partId)?.canvas?.trace;
  const bare = view ? boardGeometry(partId, view) : always ? boardGeometry(partId, "reality") : null;
  if (bare) {
    const left = pinout.pins.filter((p) => p.side === "left");
    const right = pinout.pins.filter((p) => p.side === "right");
    return { w: bare.w, h: bare.h, rows: 0, left, right, slot: { x: 0, y: bare.caption, w: bare.w, h: bare.h - bare.caption }, bare };
  }
  const left = pinout.pins.filter((p) => p.side === "left");
  const right = pinout.pins.filter((p) => p.side === "right");
  const rows = Math.max(left.length, right.length, pinout.controller ? NODE.minRowsBoard : NODE.minRowsPart);
  const w = pinout.controller ? NODE.boardWidth : NODE.partWidth;
  const h = NODE.header + NODE.padTop + rows * NODE.row + NODE.padBottom;
  const slotX = NODE.railLabel;
  const slotW = w - NODE.railLabel - (right.length ? NODE.railLabel : 12);
  return { w, h, rows, left, right, slot: { x: slotX, y: NODE.header + 4, w: slotW, h: h - NODE.header - 10 } };
}

/** The largest box a part can take in any view, for placement. */
export function nodeFootprint(partId: string): { w: number; h: number } {
  const card = nodeLayout(partId);
  const board = boardBox(partId);
  return board ? { w: Math.max(card.w, board.w), h: Math.max(card.h, board.h) } : { w: card.w, h: card.h };
}
