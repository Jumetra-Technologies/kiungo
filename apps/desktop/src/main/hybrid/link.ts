/**
 * The Hybrid link to a real board (INJ-03, INJ-04, INJ-06): Arduino CLI's
 * monitor at 115200 baud carrying COBS frames both ways. The board's frames
 * (the sketch's Serial text, what it drove, the handshake) go to the
 * interface in small batches; values for the virtual parts go to the board.
 */

import type { ChildProcess } from "node:child_process";
import { encodeHello, encodeIn, encodePing, encodeSet, encodeStop, LINK_BAUD, LinkReader, PROTOCOL_VERSION, type SafeReason } from "@kiungo/core/hybrid/protocol";
import type { CliLocation } from "../toolchain/arduino-cli";
import { monitorMessage } from "../hardware/serial";

export interface LinkEvent {
  /** Whole lines of the sketch's Serial output. */
  lines: string[];
  /** The latest state of what the sketch drove, when it changed. */
  out?: { levels: number; driven: number; pwm: Array<[number, number]> };
  /** The board answered the handshake: its runtime's protocol version, and whether Kiungo speaks it. */
  hello?: { protocol: number; compatible: boolean };
  /** The board's outputs are in the safe state, and why (SAF-01, SAF-02). */
  safe?: SafeReason;
  /** The link closed without being asked, and why. */
  closed?: string | null;
}

export interface HybridLinkOptions {
  cli: () => CliLocation | null;
  spawn: (cli: CliLocation, args: string[]) => ChildProcess;
  onEvent: (port: string, event: LinkEvent) => void;
  /** How often the PC pings, which also asks for the outputs' state. */
  pingMs?: number;
  batchMs?: number;
  /** How long the board's bootloader takes after the port opens, before the hello. */
  helloMs?: number;
  /** How long a STOP has to leave before the monitor is closed. */
  closeMs?: number;
}

export class HybridLink {
  private child: ChildProcess | null = null;
  private port: string | null = null;
  private reader = new LinkReader();
  private pending: LinkEvent = { lines: [] };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private values = new Map<number, number>();
  private errors = "";

  constructor(private readonly options: HybridLinkOptions) {}

  get open(): string | null {
    return this.port;
  }

  start(port: string): { ok: true } | { ok: false; message: string } {
    const cli = this.options.cli();
    if (!cli) return { ok: false, message: "Arduino CLI isn't installed with this copy of Kiungo." };
    this.stop();
    const child = this.options.spawn(cli, ["monitor", "-p", port, "--config", `baudrate=${LINK_BAUD}`, "--quiet"]);
    this.child = child;
    this.port = port;
    this.reader = new LinkReader();
    this.errors = "";
    this.values.clear();
    child.stdout?.on("data", (chunk: Buffer) => this.receive(port, new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    child.stderr?.on("data", (chunk: Buffer) => {
      this.errors = (this.errors + chunk.toString("utf8")).slice(-2000);
    });
    child.on("error", () => undefined);
    child.on("exit", () => {
      if (this.child !== child) return;
      this.cleanup();
      this.options.onEvent(port, { lines: [], closed: monitorMessage(this.errors) ?? "The link to the board closed." });
    });
    // The board restarts when the port opens: give its bootloader a moment, then say hello.
    setTimeout(() => this.send(encodeHello()), this.options.helloMs ?? 1800);
    this.ping = setInterval(() => this.send(encodePing(this.seq++)), this.options.pingMs ?? 100);
    return { ok: true };
  }

  /** Values for the virtual parts: only changes are sent, and every value again after the board says hello. */
  set(pairs: Array<[number, number]>): void {
    for (const [id, value] of pairs) {
      if (this.values.get(id) === value) continue;
      this.values.set(id, value);
      this.send(encodeSet(id, value));
    }
  }

  /** Text typed in the serial monitor, for the sketch's Serial.read(). */
  sendText(text: string): void {
    for (const frame of encodeIn(new TextEncoder().encode(text))) this.send(frame);
  }

  /**
   * End the run: STOP takes the board's outputs to the safe state (SAF-01),
   * then the port closes. If the STOP is lost, the board's watchdog does the
   * same once the pings stop.
   */
  stop(): void {
    const child = this.child;
    if (child) this.send(encodeStop("stop"));
    this.cleanup();
    if (child) {
      child.stdin?.end();
      // A moment for the STOP to leave before the monitor goes.
      setTimeout(() => child.kill(), this.options.closeMs ?? 150);
    }
  }

  /** Every output off at once, and held off (SAF-01). The link stays open to hear the board confirm it. */
  emergencyStop(): void {
    if (!this.child) return;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    // Twice, so one damaged frame doesn't lose it; the watchdog backs both up.
    this.send(encodeStop("emergency"));
    this.send(encodeStop("emergency"));
  }

  private cleanup(): void {
    if (this.ping) clearInterval(this.ping);
    if (this.timer) clearTimeout(this.timer);
    this.ping = null;
    this.timer = null;
    this.child = null;
    this.port = null;
  }

  private send(frame: Uint8Array): void {
    const stdin = this.child?.stdin;
    if (stdin && !stdin.destroyed) stdin.write(Buffer.from(frame));
  }

  private receive(port: string, bytes: Uint8Array): void {
    const { frames, lines } = this.reader.feedLines(bytes);
    this.pending.lines.push(...lines);
    for (const frame of frames) {
      if (frame.type === "out") this.pending.out = { levels: frame.levels, driven: frame.driven, pwm: frame.pwm };
      if (frame.type === "safe") this.pending.safe = frame.reason;
      if (frame.type === "hello") {
        this.pending.hello = { protocol: frame.protocol, compatible: frame.protocol === PROTOCOL_VERSION };
        // The board may have restarted: it has forgotten every value.
        const again = [...this.values];
        this.values.clear();
        this.set(again);
      }
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(port), this.options.batchMs ?? 50);
  }

  private flush(port: string): void {
    this.timer = null;
    const event = this.pending;
    this.pending = { lines: [] };
    if (event.lines.length || event.out || event.hello || event.safe) this.options.onEvent(port, event);
  }
}
