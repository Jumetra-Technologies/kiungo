/**
 * The knobs a part has in the lab, declared once so the Inspector can draw
 * them, the simulation can read them and tests can set them.
 *
 * Three kinds of part have inputs:
 * - sensors: their surroundings. "Simulated sweep" keeps the lab's own
 *   time-varying demo signal; "Set by you" holds the value you give.
 * - actuators without a sensor driving them: a command (servo angle, motor
 *   speed and direction, stepper moves).
 * - boards: the sketch's settings (blink delay, warning distance, gate
 *   angles). Only the settings that apply to what is wired to the board
 *   are shown.
 */

export { SOURCE_KEY, SOURCE_AUTO, SOURCE_SET } from "./control";
export type { Control } from "./control";
export {
  ohmsOf,
  ALERT_SENSORS,
  isSensorPart,
  partsOnBoard,
  boardOf,
  controlsFor,
  drivingSensor,
  inputOf,
  isSet,
  coerceInput,
  findControl,
  defaultOf,
} from "./for-node";
