/**
 * Wireable pins for every part in the catalog.
 *
 * The part models in `lib/parts` describe pins for people ("D0–D13"); the lab
 * needs one entry per pin a wire can land on, with what each pin can do. Board
 * tables list the pins a project actually uses (power, every GPIO on the small
 * boards, a sensible subset on the Mega, Pi and Teensy). Peripheral pins say
 * what the part expects from the other end of the wire.
 */

export type { PinFn, PinRole, LabPin, Pinout, PinTone } from "./types";
export { PINOUTS, getPinout, hasPinout, getPin, pinTone } from "./registry";
