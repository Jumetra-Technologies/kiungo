import type { PinRole } from "../pinout";
import { fault, onBoard, type OnBoard, type PartState, type PinView } from "./part-state";

const BUS_FN: Partial<Record<PinRole, string>> = {
  sda: "sda",
  scl: "scl",
  mosi: "mosi",
  miso: "miso",
  sck: "sck",
};
const OPPOSITE: Partial<Record<PinRole, string>> = { sda: "scl", scl: "sda" };

/** An analog output on a pin that only reads HIGH or LOW. */
function analogCheck(s: PartState, v: OnBoard, role: PinRole, fns: string[]) {
  const { pin, net, boardRef, boardPin, board, boardName } = v;
  if (role !== "out-analog" || fns.includes("analog")) return;
  const any = board.pins.some((p) => p.fns?.includes("analog"));
  fault(s, {
    severity: "warning",
    key: `not-analog:${pin.id}`,
    title: any ? `${boardPin.label} can't read analog` : `${boardName} has no analog inputs`,
    detail: any
      ? `${s.name} ${pin.label} is an analog voltage; ${boardPin.label} only reads HIGH or LOW. Use an analog pin.`
      : `${boardName} reads only digital levels. Add an ADC such as the ADS1115 to read ${s.name}.`,
    extraNodes: [boardRef.node],
    netWires: net.wires,
  });
}

/** An I²C or SPI pin that isn't on the board's hardware pin for it. */
function busCheck(s: PartState, v: OnBoard, role: PinRole, fns: string[]) {
  const { pin, net, boardRef, boardPin, boardName } = v;
  const busFn = BUS_FN[role];
  if (!busFn || fns.includes(busFn as never)) return;
  const opposite = OPPOSITE[role];
  if (opposite && fns.includes(opposite as never)) {
    fault(s, {
      severity: "error",
      key: `swapped:${pin.id}`,
      title: `SDA and SCL swapped`,
      detail: `${s.name} ${pin.label} is on ${boardName} ${boardPin.label}. Swap the two I²C wires.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  } else {
    fault(s, {
      severity: "warning",
      key: `bus-pin:${pin.id}`,
      title: `${pin.label} isn't on the ${role.toUpperCase()} pin`,
      detail: `${boardName} ${boardPin.label} isn't its hardware ${role.toUpperCase()} pin, so the default library won't find ${s.name}.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
}

/** A serial TX or RX pin on the board's pin of the same direction, or on no serial pin. */
function uartCheck(s: PartState, v: OnBoard, role: PinRole, fns: string[]) {
  const { pin, net, boardRef, boardPin, boardName } = v;
  if (role === "tx" && !fns.includes("rx")) {
    fault(s, {
      severity: fns.includes("tx") ? "error" : "tip",
      key: `uart:${pin.id}`,
      title: fns.includes("tx") ? "TX wired to TX" : "Not a hardware serial pin",
      detail: fns.includes("tx")
        ? `${s.name} TX must go to ${boardName} RX: transmit meets receive.`
        : `${boardPin.label} works with SoftwareSerial; the hardware RX pin is faster.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
  if (role === "rx" && !fns.includes("tx")) {
    fault(s, {
      severity: fns.includes("rx") ? "error" : "tip",
      key: `uart:${pin.id}`,
      title: fns.includes("rx") ? "RX wired to RX" : "Not a hardware serial pin",
      detail: fns.includes("rx")
        ? `${s.name} RX must come from ${boardName} TX.`
        : `${boardPin.label} works with SoftwareSerial; the hardware TX pin is faster.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
}

const OUTPUT_ROLES = ["out-digital", "out-analog", "io", "sda", "scl", "tx", "miso"];
const BOARD_DRIVEN = ["io", "sda", "scl", "tx", "mosi", "sck"];

/** Voltage levels both ways, and a pin the board must drive on one that only reads. */
function levelChecks(s: PartState, v: OnBoard, role: PinRole) {
  const { pin, net, boardRef, boardPin, board, boardName } = v;
  const { name, pinout } = s;
  if (role === "rx" && board.logic >= 5 && pinout.tolerates5V === false) {
    fault(s, {
      severity: "warning",
      key: `level-rx:${pin.id}`,
      title: `5 V TX into a 3.3 V RX`,
      detail: `${boardName} sends 5 V into ${name} ${pin.label}. Put a 1 kΩ/2 kΩ divider on that wire.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
  // The part's own output level against what the board accepts.
  const outV = Math.min(pinout.logic, s.supplyV ?? pinout.logic);
  if (OUTPUT_ROLES.includes(role) && outV > 3.6 && board.tolerates5V !== true) {
    fault(s, {
      severity: board.tolerates5V === "some" ? "warning" : "error",
      key: `level-out:${pin.id}`,
      title: `5 V output into a 3.3 V pin`,
      detail: `${name} ${pin.label} swings to ${outV} V; ${boardName} pins take 3.3 V. Add a 1 kΩ/2 kΩ divider.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
  if (boardPin.inputOnly && BOARD_DRIVEN.includes(role)) {
    fault(s, {
      severity: "error",
      key: `input-only:${pin.id}`,
      title: `${boardPin.label} is input-only`,
      detail: `${name} ${pin.label} needs the board to drive it. Move it to a normal GPIO.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
}

/** Signal pins: outputs, I/O, buses and serial. */
export function checkSignal(s: PartState, v: PinView) {
  const { pin, net, isWired } = v;
  if (onBoard(v)) {
    const role = pin.role as PinRole;
    const fns = v.boardPin.fns ?? [];
    analogCheck(s, v, role, fns);
    busCheck(s, v, role, fns);
    uartCheck(s, v, role, fns);
    levelChecks(s, v, role);
  } else if (net.kind === "power" || net.kind === "ground") {
    if (isWired)
      fault(s, {
        severity: "warning",
        key: `rail-signal:${pin.id}`,
        title: `${pin.label} is on a ${net.kind === "power" ? "supply" : "ground"} pin`,
        detail: `${pin.label} carries a signal and should go to a GPIO pin.`,
        extraNodes: [],
        netWires: net.wires,
      });
  } else if (pin.required && s.wired.size > 0) {
    fault(s, {
      severity: "error",
      key: `unwired:${pin.id}`,
      title: `${pin.label} isn't connected`,
      detail: `Wire ${s.name} ${pin.label} to ${pin.role === "out-analog" ? "an analog pin" : "a GPIO pin"} on a board.`,
    });
  }
}
