/**
 * Boards on USB (HW-01): Arduino CLI's own port discovery, kept running while
 * the app is open, so a board shows up the moment it's plugged in.
 */

import type { ChildProcess } from "node:child_process";
import { usbId, type DetectedBoard } from "@kiungo/core/hardware/usb";
import { parseJson, type CliLocation, type RunResult } from "../toolchain/arduino-cli";

interface PortJson {
  address?: string;
  protocol?: string;
  properties?: Record<string, string>;
}
interface MatchJson {
  name?: string;
  fqbn?: string;
}
interface ListJson {
  detected_ports?: Array<{ matching_boards?: MatchJson[]; port?: PortJson }>;
}
interface WatchJson {
  eventType?: string;
  matching_boards?: MatchJson[];
  port?: PortJson;
  error?: string;
}

export function toDetected(port: PortJson | undefined, matches: MatchJson[] | undefined): DetectedBoard | null {
  if (!port?.address) return null;
  const props = port.properties ?? {};
  return {
    port: port.address,
    protocol: port.protocol ?? "serial",
    usbId: usbId(props.vid, props.pid),
    serialNumber: props.serialNumber || null,
    matches: (matches ?? []).filter((m): m is { name: string; fqbn: string } => Boolean(m.name && m.fqbn)).map((m) => ({ name: m.name, fqbn: m.fqbn })),
  };
}

/** Serial ports only: network boards and Bluetooth ports aren't for uploading here. */
const isSerial = (b: DetectedBoard) => b.protocol === "serial";

export interface BoardWatcherOptions {
  cli: () => CliLocation | null;
  run: (cli: CliLocation, args: string[], timeoutMs?: number) => Promise<RunResult>;
  spawn: (cli: CliLocation, args: string[]) => ChildProcess;
  onChange: (boards: DetectedBoard[]) => void;
  /** Wait before restarting discovery after it stops: grows to 30 s. */
  restartDelayMs?: number;
}

export class BoardWatcher {
  private readonly boards = new Map<string, DetectedBoard>();
  private child: ChildProcess | null = null;
  private started = false;
  private stopped = false;
  private delay: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  message: string | null = null;

  constructor(private readonly options: BoardWatcherOptions) {
    this.delay = options.restartDelayMs ?? 2000;
  }

  list(): DetectedBoard[] {
    return [...this.boards.values()].filter(isSerial).sort((a, b) => a.port.localeCompare(b.port, "en", { numeric: true }));
  }

  has(port: string): boolean {
    return this.boards.has(port) && isSerial(this.boards.get(port) as DetectedBoard);
  }

  /** Start watching (once). Resolves after the first full list, so the first answer isn't empty. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const cli = this.options.cli();
    if (!cli) {
      this.message = "Arduino CLI isn't installed with this copy of Kiungo, so it can't find boards.";
      return;
    }
    await this.refresh(cli);
    this.watch(cli);
  }

  /** A full list now, replacing what's known. */
  async refresh(cli = this.options.cli()): Promise<DetectedBoard[]> {
    if (!cli) return this.list();
    const raw = await this.options.run(cli, ["board", "list", "--format", "json"], 30_000);
    const json = parseJson<ListJson>(raw.stdout);
    if (json) {
      this.boards.clear();
      for (const d of json.detected_ports ?? []) {
        const b = toDetected(d.port, d.matching_boards);
        if (b) this.boards.set(b.port, b);
      }
      this.options.onChange(this.list());
    }
    return this.list();
  }

  /** One line of `board list --watch --format jsonmini`. */
  handleLine(line: string): void {
    const text = line.trim();
    if (!text.startsWith("{")) return;
    let event: WatchJson;
    try {
      event = JSON.parse(text) as WatchJson;
    } catch {
      return;
    }
    if (event.error) return;
    const board = toDetected(event.port, event.matching_boards);
    if (!board) return;
    if (event.eventType === "add") this.boards.set(board.port, board);
    else if (event.eventType === "remove") this.boards.delete(board.port);
    else return;
    this.options.onChange(this.list());
  }

  private watch(cli: CliLocation): void {
    if (this.stopped) return;
    const child = this.options.spawn(cli, ["board", "list", "--watch", "--format", "jsonmini"]);
    this.child = child;
    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) this.handleLine(line);
      // Discovery is working: the next restart can be quick again.
      this.delay = this.options.restartDelayMs ?? 2000;
    });
    child.on("error", () => undefined);
    child.on("exit", () => {
      if (this.child !== child || this.stopped) return;
      this.child = null;
      this.timer = setTimeout(() => {
        void this.refresh(cli).finally(() => this.watch(cli));
      }, this.delay);
      this.delay = Math.min(this.delay * 2, 30_000);
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.child?.kill();
    this.child = null;
  }
}
