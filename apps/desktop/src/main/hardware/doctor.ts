/**
 * Why a plugged-in board might not show up, and what to do (FIX-09).
 *
 * On Linux the computer can say: a USB serial chip is plugged in but has no
 * port (brltty, the braille-display service, grabbed it), or the port is
 * there but the person isn't allowed to open it (the dialout group). On
 * Windows and macOS a missing driver can't be seen from here, so the steps
 * say where to get the official one.
 */

import { access, constants, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { knownUsbChip, type DetectedBoard } from "@kiungo/core/hardware/usb";

export type PortHintId = "brltty" | "dialout" | "no-port" | "driver-ch340" | "driver-cp210x" | "cable";

export interface PortHint {
  id: PortHintId;
  title: string;
  steps: string[];
  /** Official download pages the steps refer to, opened in the browser. */
  links?: Array<{ label: string; url: string }>;
}

/** The only pages the app opens for drivers: the chip makers' own. */
export const DRIVER_LINKS = {
  ch340: { label: "WCH CH340 driver (the chip maker's site)", url: "https://www.wch-ic.com/downloads/CH341SER_EXE.html" },
  ch340mac: { label: "WCH CH340 driver for macOS", url: "https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html" },
  cp210x: { label: "Silicon Labs CP210x driver", url: "https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers" },
} as const;

export interface DoctorEnv {
  platform: NodeJS.Platform;
  /** /sys/bus/usb/devices on Linux. */
  usbDevicesDir: string;
  /** Where brltty would be installed. */
  brlttyPaths: string[];
  canOpen: (path: string) => Promise<boolean>;
  exists: (path: string) => Promise<boolean>;
}

export const defaultDoctorEnv = (platform: NodeJS.Platform): DoctorEnv => ({
  platform,
  usbDevicesDir: "/sys/bus/usb/devices",
  brlttyPaths: ["/usr/bin/brltty", "/bin/brltty", "/usr/sbin/brltty"],
  canOpen: (path) =>
    access(path, constants.R_OK | constants.W_OK).then(
      () => true,
      () => false,
    ),
  exists: (path) =>
    access(path).then(
      () => true,
      () => false,
    ),
});

/** USB serial chips plugged in that have no tty, on Linux: "1a86:7523" etc. */
async function chipsWithoutPort(env: DoctorEnv): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(env.usbDevicesDir).catch(() => [] as string[]);
  for (const entry of entries) {
    if (entry.includes(":")) continue; // interfaces, not devices
    const dir = join(env.usbDevicesDir, entry);
    const vid = (await readFile(join(dir, "idVendor"), "utf8").catch(() => "")).trim().toLowerCase();
    const pid = (await readFile(join(dir, "idProduct"), "utf8").catch(() => "")).trim().toLowerCase();
    if (!vid || !pid) continue;
    const id = `${vid}:${pid}`;
    if (!knownUsbChip(id)) continue;
    // A tty shows up under one of the device's interfaces: <dev>:1.0/ttyUSB0 or <dev>:1.0/tty/ttyACM0.
    const interfaces = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.startsWith(`${entry}:`));
    let tty = false;
    for (const i of interfaces) {
      const names = await readdir(join(dir, i)).catch(() => [] as string[]);
      if (names.some((n) => n.startsWith("tty"))) tty = true;
    }
    if (!tty) found.push(id);
  }
  return found;
}

export async function diagnosePorts(boards: readonly DetectedBoard[], env: DoctorEnv): Promise<PortHint[]> {
  const hints: PortHint[] = [];

  if (env.platform === "linux") {
    const orphans = await chipsWithoutPort(env);
    if (orphans.length) {
      let brltty = false;
      for (const p of env.brlttyPaths) if (await env.exists(p)) brltty = true;
      const chip = knownUsbChip(orphans[0])?.chip ?? "USB serial";
      hints.push(
        brltty
          ? {
              id: "brltty",
              title: `A ${chip} board is plugged in, but brltty took its port`,
              steps: [
                "brltty is a service for braille displays. On Ubuntu it claims CH340 and similar boards by mistake.",
                "If you don't use a braille display, open a terminal and run: sudo apt remove brltty",
                "Unplug the board and plug it back in.",
              ],
            }
          : {
              id: "no-port",
              title: `A ${chip} board is plugged in, but no port appeared`,
              steps: ["Unplug the board and plug it back in.", "Try another USB port on the computer.", "If it still doesn't appear, restart the computer."],
            },
      );
    }
    const blocked: string[] = [];
    for (const b of boards) if (!(await env.canOpen(b.port))) blocked.push(b.port);
    if (blocked.length) {
      hints.push({
        id: "dialout",
        title: `You're not allowed to use ${blocked.join(", ")} yet`,
        steps: ["Linux lets only members of the dialout group use serial ports. Open a terminal and run: sudo usermod -aG dialout $USER", "Log out and back in (or restart) so the change takes effect."],
      });
    }
  }

  if (!boards.length) {
    if (env.platform === "win32" || env.platform === "darwin") {
      hints.push({
        id: "driver-ch340",
        title: "A Nano or Uno clone needs the CH340 driver",
        steps: [
          "Most clone boards use a CH340 USB chip (the small chip near the USB socket says so).",
          env.platform === "win32" ? "Windows 10 and 11 usually install its driver by themselves. If the board still doesn't appear after a minute, install the driver from the chip maker." : "Recent macOS includes it. On an older Mac, install the driver from the chip maker.",
          "Unplug the board and plug it back in.",
        ],
        links: [env.platform === "win32" ? DRIVER_LINKS.ch340 : DRIVER_LINKS.ch340mac],
      });
      hints.push({
        id: "driver-cp210x",
        title: "Many ESP32 boards need the CP210x driver",
        steps: ["ESP32 boards often use a CP2102 USB chip. Install its driver from Silicon Labs, then plug the board back in."],
        links: [DRIVER_LINKS.cp210x],
      });
    }
    hints.push({
      id: "cable",
      title: "Check the cable",
      steps: ["Some USB cables only carry power. Use one you know works for data, such as the one that came with the board.", "Plug straight into the computer, not a hub."],
    });
  }

  return hints;
}
