/**
 * What went wrong with an upload, and what to try (BLD-06, FIX-09).
 *
 * avrdude and esptool say why an upload failed in their own words. These are
 * the failures people meet with a new board, matched to steps a student can
 * follow, in the order most likely to work.
 */

import type { HardwareBoardId } from "./boards";

export type HostPlatform = "win32" | "linux" | "darwin";

export interface UploadProblem {
  id:
    | "permission"
    | "port-busy"
    | "port-missing"
    | "no-sync"
    | "esp-no-boot-mode"
    | "esp-wrong-chip"
    | "verify-failed"
    | "too-big"
    | "unknown";
  title: string;
  steps: string[];
  /** Upload again for this board instead: the likely fix for a clone with the old bootloader. */
  retryWith?: HardwareBoardId;
}

const has = (out: string, re: RegExp) => re.test(out);

export function uploadProblem(
  output: string,
  board: HardwareBoardId,
  platform: HostPlatform,
): UploadProblem {
  const out = output;

  if (has(out, /Permission denied|\[Errno 13\]/i) && platform !== "win32") {
    return {
      id: "permission",
      title: "This computer won't let Kiungo use the USB port",
      steps:
        platform === "linux"
          ? [
              "Linux lets only members of the dialout group use serial ports. Open a terminal and run: sudo usermod -aG dialout $USER",
              "Log out and back in (or restart) so the change takes effect.",
              "Upload again.",
            ]
          : [
              "Unplug the board, plug it back in, and upload again.",
              "If it still fails, restart the computer.",
            ],
    };
  }

  if (
    has(
      out,
      /Access is denied|Device or resource busy|port is busy|Resource busy|could not open port.*busy/i,
    )
  ) {
    return {
      id: "port-busy",
      title: "Another program is using the board's port",
      steps: [
        "Close other programs that talk to the board: the Arduino IDE (and its serial monitor), Cura, PuTTY, or another copy of Kiungo.",
        "Unplug the board and plug it back in.",
        "Upload again.",
      ],
    };
  }

  if (
    has(
      out,
      /No such file or directory|cannot find the file specified|port.*(not found|doesn't exist)|could not find port|Port monitor error|no upload port/i,
    )
  ) {
    return {
      id: "port-missing",
      title: "The board isn't on that port any more",
      steps: [
        "Check the USB cable is still plugged in at both ends.",
        "Pick the board again in Upload to: it may have a new port name after being plugged back in.",
        "Upload again.",
      ],
    };
  }

  if (
    has(out, /Wrong boot mode|download mode|Failed to connect to ESP32|No serial data received/i)
  ) {
    return {
      id: "esp-no-boot-mode",
      title: "The ESP32 didn't start listening for the upload",
      steps: [
        "Click Upload, and when Uploading appears, press and hold the BOOT button on the board.",
        "Let go once the progress starts (a second or two).",
        "If it still fails, try another USB cable: some only carry power.",
      ],
    };
  }

  if (has(out, /This chip is (ESP32-\w+)|Wrong --chip argument/i)) {
    const chip = /This chip is (ESP32-\w+)/.exec(out)?.[1] ?? "a different ESP32";
    return {
      id: "esp-wrong-chip",
      title: `This board is ${chip}, not the ESP32 the project is for`,
      steps: [`Kiungo builds for the original ESP32. ${chip} boards arrive in a later update.`],
    };
  }

  if (
    has(
      out,
      /not in sync|programmer is not responding|stk500v2_ReceiveMessage\(\): timeout|getsync\(\)|timeout communicating with programmer/i,
    )
  ) {
    const nano = board === "nano";
    return {
      id: "no-sync",
      title: nano
        ? "The board didn't answer: it may have the Nano's old bootloader"
        : "The board didn't answer the upload",
      steps: nano
        ? [
            "Most Nano clones (CH340 chip) still have the old bootloader. Upload again as Arduino Nano (old bootloader).",
            "If that fails too, check Upload to: is the port this board's?",
          ]
        : [
            "Check Upload to: is this the right board and port? A Nano clone needs Arduino Nano or Arduino Nano (old bootloader), not Uno.",
            "Unplug anything wired to pins 0 and 1: they carry the upload.",
            "Press the board's reset button just as Uploading appears.",
            "Try another USB cable: some only carry power.",
          ],
      ...(nano ? { retryWith: "nano-old" as const } : {}),
    };
  }

  if (has(out, /verification error|content mismatch|verify failed/i)) {
    return {
      id: "verify-failed",
      title: "The program didn't arrive whole",
      steps: [
        "Use a shorter USB cable, or another USB port on the computer (not a hub).",
        "Upload again.",
      ],
    };
  }

  if (has(out, /Sketch too big|text section exceeds available space/i)) {
    return {
      id: "too-big",
      title: "The program is too big for this board",
      steps: [
        "Build to see the memory meters, then make the program smaller or choose a board with more memory.",
      ],
    };
  }

  return {
    id: "unknown",
    title: "The upload didn't work",
    steps: [
      "Unplug the board, plug it back in, and upload again.",
      "Check Upload to: is the board and port right?",
      "The upload log below has the details.",
    ],
  };
}
