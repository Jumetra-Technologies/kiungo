/**
 * Board definitions: the real limits of each board, with nothing added (HWT-01).
 *
 * Sprint 1 holds the two boards the first emulator runs, with what the
 * emulator needs. Sprint 6 adds every pin's functions, timers, reserved pins
 * and the rest of the boards, in this same file per board.
 */

export type McuId = "atmega328p";

/** One header pin and the chip port bit behind it. */
export interface BoardPin {
  /** The name printed on the board: "D13", "A0". */
  name: string;
  /** The number Arduino code uses: 13, 14 for A0. */
  arduino: number;
  port: "B" | "C" | "D";
  bit: number;
  pwm?: boolean;
  analog?: boolean;
}

export interface BoardDefinition {
  id: "uno" | "nano";
  name: string;
  /** Arduino's fully qualified board name, used by Arduino CLI. */
  fqbn: string;
  mcu: McuId;
  clockHz: number;
  /** Flash on the chip, in bytes. */
  flashBytes: number;
  /** Flash the bootloader keeps, so the largest sketch is flashBytes minus this. */
  bootloaderBytes: number;
  sramBytes: number;
  eepromBytes: number;
  /** The pin the on-board LED is wired to (LED_BUILTIN). */
  ledBuiltin: number;
  pins: readonly BoardPin[];
}

const PWM_328P = new Set([3, 5, 6, 9, 10, 11]);

function atmega328pPins(analogCount: 6 | 8): BoardPin[] {
  const pins: BoardPin[] = [];
  for (let n = 0; n <= 7; n++) pins.push({ name: `D${n}`, arduino: n, port: "D", bit: n, pwm: PWM_328P.has(n) || undefined });
  for (let n = 8; n <= 13; n++) pins.push({ name: `D${n}`, arduino: n, port: "B", bit: n - 8, pwm: PWM_328P.has(n) || undefined });
  // A6 and A7 on the Nano are analog-only inputs with no port bit; they join when the ADC model does.
  for (let n = 0; n < Math.min(analogCount, 6); n++) pins.push({ name: `A${n}`, arduino: 14 + n, port: "C", bit: n, analog: true });
  return pins;
}

export const UNO: BoardDefinition = {
  id: "uno",
  name: "Arduino Uno",
  fqbn: "arduino:avr:uno",
  mcu: "atmega328p",
  clockHz: 16_000_000,
  flashBytes: 32_768,
  bootloaderBytes: 512,
  sramBytes: 2048,
  eepromBytes: 1024,
  ledBuiltin: 13,
  pins: atmega328pPins(6),
};

export const NANO: BoardDefinition = {
  id: "nano",
  name: "Arduino Nano",
  fqbn: "arduino:avr:nano:cpu=atmega328",
  mcu: "atmega328p",
  clockHz: 16_000_000,
  flashBytes: 32_768,
  // The Nano's bootloader is Optiboot (512 bytes), but arduino:avr keeps 2 KB for it (upload.maximum_size=30720), as the old one needed.
  bootloaderBytes: 2048,
  sramBytes: 2048,
  eepromBytes: 1024,
  ledBuiltin: 13,
  pins: atmega328pPins(8),
};

export const BOARDS = { uno: UNO, nano: NANO } as const;

/** The largest program the board accepts, in bytes. */
export function maxSketchBytes(board: BoardDefinition): number {
  return board.flashBytes - board.bootloaderBytes;
}

export function pinByArduino(board: BoardDefinition, arduino: number): BoardPin | undefined {
  return board.pins.find((p) => p.arduino === arduino);
}
