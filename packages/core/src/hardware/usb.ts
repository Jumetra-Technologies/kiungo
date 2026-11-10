/**
 * Plain names for what's plugged in (HW-01).
 *
 * Arduino CLI recognizes genuine boards by their USB IDs. Clones and most
 * ESP32 boards use a USB-to-serial chip instead, which says nothing about
 * the board, so the name says what the chip usually means.
 */

import { HARDWARE_BOARDS, type HardwareBoardId } from "./boards";

/** A serial port Arduino CLI found, as the main process passes it on. */
export interface DetectedBoard {
  /** "COM3", "/dev/ttyUSB0", "/dev/cu.usbserial-1410". */
  port: string;
  protocol: string;
  /** "vid:pid" in lower-case hex, when the port is USB. */
  usbId: string | null;
  serialNumber: string | null;
  /** Boards Arduino CLI matched by USB ID, by its own names and FQBNs. */
  matches: Array<{ name: string; fqbn: string }>;
}

export interface BoardIdentity {
  /** What Kiungo calls it: "Arduino Uno", "USB serial board (CH340)". */
  name: string;
  /** The USB chip, for a clone: "CH340". */
  chip: string | null;
  /** Kiungo's boards it's likely to be, most likely first. */
  likely: HardwareBoardId[];
  /** Arduino CLI recognized the board itself, not only its USB chip. */
  certain: boolean;
}

const USB_CHIPS: Record<string, { chip: string; name: string; likely: HardwareBoardId[] }> = {
  "1a86:7523": {
    chip: "CH340",
    name: "USB serial board (CH340)",
    likely: ["nano-old", "nano", "uno"],
  },
  "1a86:5523": {
    chip: "CH341",
    name: "USB serial board (CH341)",
    likely: ["nano-old", "nano", "uno"],
  },
  "1a86:55d4": { chip: "CH9102", name: "USB serial board (CH9102)", likely: ["esp32"] },
  "10c4:ea60": { chip: "CP2102", name: "USB serial board (CP2102)", likely: ["esp32"] },
  "0403:6001": {
    chip: "FTDI FT232R",
    name: "USB serial board (FTDI)",
    likely: ["nano", "nano-old"],
  },
  "0403:6015": {
    chip: "FTDI FT231X",
    name: "USB serial board (FTDI)",
    likely: ["nano", "nano-old"],
  },
};

/** "0x2341" and "0x0043" (as Arduino CLI reports them) to "2341:0043". */
export function usbId(vid: string | undefined, pid: string | undefined): string | null {
  if (!vid || !pid) return null;
  const clean = (v: string) => v.replace(/^0x/i, "").toLowerCase().padStart(4, "0");
  return `${clean(vid)}:${clean(pid)}`;
}

export function identifyBoard(board: DetectedBoard): BoardIdentity {
  const known = board.usbId
    ? HARDWARE_BOARDS.find((b) => b.usbIds.includes(board.usbId as string))
    : undefined;
  if (known) return { name: known.name, chip: null, likely: [known.id], certain: true };
  const matched = board.matches[0];
  if (matched) {
    const ours = HARDWARE_BOARDS.find(
      (b) => b.fqbn === matched.fqbn || matched.fqbn.startsWith(`${b.fqbn}:`),
    );
    return { name: matched.name, chip: null, likely: ours ? [ours.id] : [], certain: true };
  }
  const chip = board.usbId ? USB_CHIPS[board.usbId] : undefined;
  if (chip) return { name: chip.name, chip: chip.chip, likely: chip.likely, certain: false };
  if (board.usbId)
    return { name: `USB serial device (${board.usbId})`, chip: null, likely: [], certain: false };
  return { name: "Serial port", chip: null, likely: [], certain: false };
}

/** USB chips whose boards Kiungo knows, for spotting a board whose port didn't appear (FIX-09). */
export function knownUsbChip(id: string): { chip: string; name: string } | null {
  const c = USB_CHIPS[id];
  return c ? { chip: c.chip, name: c.name } : null;
}
