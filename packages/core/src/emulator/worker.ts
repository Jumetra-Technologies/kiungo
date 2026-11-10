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

type Message<T extends ToWorker["type"]> = Extract<ToWorker, { type: T }>;

function load(message: Message<"load">) {
  pacer?.stop();
  const b = new AvrBoard(BOARDS[message.board], message.hex);
  board = b;
  shared = message.pins ? new Uint8Array(message.pins, 0, PIN_SLOTS) : null;
  b.onPinChange((change) => {
    if (shared && change.pin < PIN_SLOTS) shared[change.pin] = LEVEL_CODES[change.level];
    else pending.push(change);
  });
  b.onSerialByte((byte) => (serial += String.fromCharCode(byte)));
  const s = new PinStats(
    b.board.clockHz,
    b.board.pins.map((p) => p.arduino),
  );
  b.onPinChange((change) => s.record(change));
  peripherals = new Peripherals(b);
  robot?.dispose();
  robot = null;
  pacer = new Pacer(b, {
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
  post({ type: "loaded", programBytes: b.programBytes });
}

function stop() {
  pacer?.stop();
  flush();
  if (board) post({ type: "status", running: false, simMs: board.timeMs, speedPercent: 0 });
}

function world(message: Message<"world">) {
  const b = board;
  const p = peripherals;
  if (!b || !p) return;
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
}

const HANDLERS: { [T in ToWorker["type"]]: (message: Message<T>) => void } = {
  load,
  start: () => pacer?.start(),
  stop,
  input: (message) => board?.setInput(message.pin, message.high),
  peripherals: (message) => {
    if (robot) robot.setOtherInputs(message.inputs);
    else peripherals?.apply(message.inputs);
  },
  world,
  "world-obstacles": (message) => robot?.world.setObstacles(message.obstacles),
  "serial-in": (message) => board?.writeSerial(new TextEncoder().encode(message.text)),
};

scope.onmessage = (event) => {
  const message = event.data;
  try {
    // Messages from an older or newer app with a type this worker doesn't know are ignored, as before.
    if (!Object.hasOwn(HANDLERS, message.type)) return;
    (HANDLERS[message.type] as (m: ToWorker) => void)(message);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
