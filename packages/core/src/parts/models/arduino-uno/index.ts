/**
 * The Arduino Uno R3, laid out as the real board is.
 *
 * Measured from the Rev3 reference design (68.58 × 53.34 mm, USB on the left,
 * digital header along the top, power and analog headers along the bottom),
 * so that every header hole, chip, jack and LED sits where it does on the
 * bench. The lab wires to these holes directly (`canvas`), and the USB lead
 * plugs into the real USB-B jack.
 *
 * The board's hardware design is open (CC BY-SA). The Arduino name and logo
 * are Arduino SA's trademarks, so the silkscreen carries the functional
 * markings only (pin names, DIGITAL, POWER, ANALOG IN, L, TX, RX, ON, ICSP).
 */

export { UNO_SIZE } from "./layout";
export { ARDUINO_UNO } from "./model";
