/**
 * Solderless breadboards, laid out as the real ones are: a mini (170 points),
 * a half-size (400) and a full-size (830).
 *
 * Columns of terminal strips (rows a–e above the center channel, f–j below;
 * the five holes of one half-column are one strip), and on the half and full
 * sizes four power rails, a + and a − along the top and the bottom edge,
 * each one strip along its whole length. Everything sits on the 0.1"
 * (2.54 mm) grid, so chips straddle the channel and module headers drop in.
 *
 * The lab wires to every hole (`canvas`) and joins the holes of a strip into
 * one net (`strips`, used by `lib/lab/pinout.ts`). That is what a breadboard
 * is for: one 5 V pin on the board feeds the + rail, and every part takes its
 * supply from the rail.
 */

export {
  TERMINAL_ROWS,
  BREADBOARD_SPECS,
  breadboardSpec,
  BREADBOARD_SIZE,
  BREADBOARD_COLUMNS,
  RAIL_HOLES,
  RAILS,
  RAIL_IDS,
  BREADBOARD_HOLES,
  BREADBOARD_STRIPS,
  stripName,
} from "./spec";
export type { RailId, RailInfo, BreadboardHole, BreadboardSpec } from "./spec";
export { BREADBOARD, BREADBOARD_FULL, BREADBOARD_MINI, PROTOTYPING } from "./model";
