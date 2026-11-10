/**
 * Web Worker entry for one emulated board. The app creates it with
 * `new Worker(new URL("@kiungo/core/emulator/worker", import.meta.url), { type: "module" })`
 * and talks to it with the messages in ./protocol.
 */
import { BOARDS } from "../boards";
import { AvrBoard, type PinChange } from "./avr";
import { Peripherals } from "./peripherals";
import { PinStats } from "./pinstats";
import { LEVEL_CODES, PIN_SLOTS, type FromWorker, type ToWorker } from "./protocol";
import { Pacer } from "./realtime";
import { RobotRun } from "../world/harness";
import { initPhysics } from "../world/sim";

type Scope = {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};
const scope = self as unknown as Scope;

let board: AvrBoard | null = null;
let pacer: Pacer | null = null;
let shared: Uint8Array | null = null;
let pending: PinChange[] = [];
let serial = "";
let stats: PinStats | null = null;
let peripherals: Peripherals | null = null;
let robot: RobotRun | null = null;
let robotStats: PinStats | null = null;
let worldMs = 0;

const post = (message: FromWorker) => scope.postMessage(message);

function flush() {
  if (pending.length) post({ type: "pins", changes: pending });
  pending = [];
  if (serial) post({ type: "serial", text: serial });
  serial = "";
}

scope.onmessage = (event) => {
  const message = event.data;
  try {
    switch (message.type) {
      case "load": {
        pacer?.stop();
        board = new AvrBoard(BOARDS[message.board], message.hex);
        shared = message.pins ? new Uint8Array(message.pins, 0, PIN_SLOTS) : null;
        board.onPinChange((change) => {
          if (shared && change.pin < PIN_SLOTS) shared[change.pin] = LEVEL_CODES[change.level];
          else pending.push(change);
        });
        board.onSerialByte((byte) => (serial += String.fromCharCode(byte)));
        stats = new PinStats(
          board.board.clockHz,
          board.board.pins.map((p) => p.arduino),
        );
        const s = stats;
        board.onPinChange((change) => s.record(change));
        peripherals = new Peripherals(board);
        const b = board;
        robot?.dispose();
        robot = null;
        pacer = new Pacer(board, {
          reportEveryMs: 50,
          onStatus: ({ simMs, speedPercent }) => {
            flush();
            post({
              type: "readings",
              simMs,
              speedPercent,
              pins: s.take(b.cycles),
              crashed: b.crashed,
              ...(robot ? { world: robot.world.state() } : {}),
            });
            if (b.crashed) pacer?.stop();
          },
          onSlice: () => {
            // The world moves in the same simulated time as the board, in steps of at least 10 ms.
            if (!robot || !robotStats) return;
            const dt = b.timeMs - worldMs;
            if (dt < 10) return;
            robot.move(robotStats.take(b.cycles), dt / 1000);
            worldMs = b.timeMs;
          },
        });
        post({ type: "loaded", programBytes: board.programBytes });
        break;
      }
      case "start":
        pacer?.start();
        break;
      case "stop":
        pacer?.stop();
        flush();
        if (board) post({ type: "status", running: false, simMs: board.timeMs, speedPercent: 0 });
        break;
      case "input":
        board?.setInput(message.pin, message.high);
        break;
      case "peripherals":
        if (robot) robot.setOtherInputs(message.inputs);
        else peripherals?.apply(message.inputs);
        break;
      case "world": {
        const b = board;
        const p = peripherals;
        if (!b || !p) break;
        void initPhysics().then(() => {
          if (board !== b) return;
          robotStats = new PinStats(
            b.board.clockHz,
            b.board.pins.map((pin) => pin.arduino),
          );
          const stats = robotStats;
          b.onPinChange((change) => stats.record(change));
          robot = new RobotRun(b, message.wiring, message.world, message.robot, {
            peripherals: p,
            stats,
          });
          worldMs = b.timeMs;
          post({ type: "world-ready" });
        });
        break;
      }
      case "world-obstacles":
        robot?.world.setObstacles(message.obstacles);
        break;
      case "serial-in":
        board?.writeSerial(new TextEncoder().encode(message.text));
        break;
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
