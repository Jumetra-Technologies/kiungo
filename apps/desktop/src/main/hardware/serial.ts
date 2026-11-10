/**
 * The serial monitor (HW-02): Arduino CLI's `monitor`, run as a child process.
 * What the board sends goes to the interface in small batches; what the
 * person types goes to the board. One port at a time.
 */

import type { ChildProcess } from "node:child_process";
import type { CliLocation } from "../toolchain/arduino-cli";

export const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000] as const;

export interface SerialMonitorOptions {
  cli: () => CliLocation | null;
  spawn: (cli: CliLocation, args: string[]) => ChildProcess;
  onData: (port: string, text: string) => void;
  /** The monitor stopped without being asked: unplugged, or the port was taken. */
  onClosed: (port: string, message: string | null) => void;
  /** Batch what arrives for this long, so a fast board doesn't flood the interface. */
  batchMs?: number;
}

/** At most this much text per batch; a board printing faster than this loses the excess, and says so. */
const MAX_BATCH = 64 * 1024;

export class SerialMonitor {
  private child: ChildProcess | null = null;
  private current: { port: string; baud: number } | null = null;
  private pending = "";
  private dropped = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private errors = "";

  constructor(private readonly options: SerialMonitorOptions) {}

  get open(): { port: string; baud: number } | null {
    return this.current;
  }

  start(port: string, baud: number): { ok: true } | { ok: false; message: string } {
    const cli = this.options.cli();
    if (!cli) return { ok: false, message: "Arduino CLI isn't installed with this copy of Kiungo." };
    this.stop();
    const child = this.options.spawn(cli, ["monitor", "-p", port, "--config", `baudrate=${baud}`, "--quiet"]);
    this.child = child;
    this.current = { port, baud };
    this.errors = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.queue(port, chunk));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      this.errors = (this.errors + chunk).slice(-2000);
    });
    child.on("error", () => undefined);
    child.on("exit", () => {
      if (this.child !== child) return;
      this.flush(port);
      this.child = null;
      this.current = null;
      this.options.onClosed(port, monitorMessage(this.errors));
    });
    return { ok: true };
  }

  write(text: string): boolean {
    if (!this.child?.stdin || this.child.stdin.destroyed) return false;
    this.child.stdin.write(text);
    return true;
  }

  /** Stop on purpose: no closed message. */
  stop(): void {
    const child = this.child;
    if (this.current) this.flush(this.current.port);
    this.child = null;
    this.current = null;
    if (child) {
      child.stdin?.end();
      child.kill();
    }
  }

  private queue(port: string, chunk: string): void {
    if (this.pending.length + chunk.length > MAX_BATCH) {
      const room = Math.max(0, MAX_BATCH - this.pending.length);
      this.dropped += chunk.length - room;
      chunk = chunk.slice(0, room);
    }
    this.pending += chunk;
    if (!this.timer) this.timer = setTimeout(() => this.flush(port), this.options.batchMs ?? 50);
  }

  private flush(port: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    let text = this.pending;
    if (this.dropped) text += `\n[Kiungo: ${this.dropped.toLocaleString("en-US")} characters skipped: the board is sending faster than the monitor can show]\n`;
    this.pending = "";
    this.dropped = 0;
    if (text) this.options.onData(port, text);
  }
}

/** Why the monitor stopped, in plain words, or null if there's nothing useful to say. */
export function monitorMessage(stderr: string): string | null {
  if (/Permission denied/i.test(stderr)) return "This computer won't let Kiungo open the port. On Linux, add yourself to the dialout group (sudo usermod -aG dialout $USER), then log out and back in.";
  if (/Access is denied|busy/i.test(stderr)) return "Another program is using the port. Close the Arduino IDE's serial monitor or any other program using the board, then try again.";
  if (/no such file|not found|cannot find|No such device|disconnected|EOF/i.test(stderr)) return "The board was unplugged.";
  return stderr.trim() ? stderr.trim().split("\n").pop() ?? null : null;
}
