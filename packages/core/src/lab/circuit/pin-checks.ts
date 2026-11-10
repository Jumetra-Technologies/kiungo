import { fault, onBoard, type OnBoard, type PartState, type PinView } from "./part-state";

export function checkVcc(s: PartState, v: PinView) {
  const { pin, net, boardRef, boardPin, board, boardName } = v;
  const { name, pinout } = s;
  if (net.kind === "power" && net.voltage !== undefined) {
    s.supplyV = net.voltage;
    s.poweredByRail = true;
    const [min, max] = pinout.supply ?? [0, 99];
    if (net.voltage > max + 0.25) {
      fault(s, {
        severity: "error",
        key: `over:${pin.id}`,
        title: `${net.voltage} V on a ${max} V part`,
        detail: `${name} takes ${min}–${max} V but ${pin.label} is on the ${net.voltage} V rail. It would be damaged. Move it to 3.3 V.`,
        extraNodes: [],
        netWires: net.wires,
      });
    } else if (net.voltage < min - 0.2) {
      fault(s, {
        severity: "warning",
        key: `under:${pin.id}`,
        title: `Underpowered at ${net.voltage} V`,
        detail: `${name} needs ${min}–${max} V; on ${net.voltage} V it may not run or will read wrong. Use the 5 V pin.`,
        extraNodes: [],
        netWires: net.wires,
      });
    }
  } else if (net.kind === "signal" && boardRef && board) {
    s.supplyV = board.logic;
    s.poweredByRail = true;
    fault(s, {
      severity: "warning",
      key: `gpio-power:${pin.id}`,
      title: `Powered from a GPIO pin`,
      detail: `${pin.label} is on ${boardName} ${boardPin?.label}. A GPIO pin gives about 20 mA; wire ${pin.label} to a power pin.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  } else if (net.kind === "ground") {
    fault(s, {
      severity: "error",
      key: `vcc-gnd:${pin.id}`,
      title: `${pin.label} is wired to ground`,
      detail: `${name} gets no supply this way. Move ${pin.label} to a ${pinout.supply && pinout.supply[1] < 4 ? "3.3 V" : "5 V"} pin.`,
      extraNodes: [],
      netWires: net.wires,
    });
  }
}

export function checkGnd(s: PartState, v: PinView) {
  const { pin, net } = v;
  if (net.kind === "ground") s.grounded = true;
  else if (net.kind === "power")
    fault(s, {
      severity: "error",
      key: `gnd-vcc:${pin.id}`,
      title: `${pin.label} is on a supply rail`,
      detail: `Ground pins go to GND. With ${pin.label} on ${net.voltage} V, ${s.name} has no return path.`,
      extraNodes: [],
      netWires: net.wires,
    });
}

/** A drive, PWM or chip-select pin on a board's signal pin. */
function driveFromBoard(s: PartState, v: OnBoard) {
  const { pin, net, boardRef, boardPin, board, boardName } = v;
  const { name, pinout, node } = s;
  if (boardPin.inputOnly) {
    fault(s, {
      severity: "error",
      key: `input-only:${pin.id}`,
      title: `${boardPin.label} can't drive outputs`,
      detail: `${boardName} ${boardPin.label} is input-only. Move ${pin.label} to an output-capable pin.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
    return;
  }
  s.driven = true;
  s.driveV ??= board.logic;
  if (pin.role === "pwm" && !boardPin.fns?.includes("pwm")) {
    fault(s, {
      severity: "warning",
      key: `no-pwm:${pin.id}`,
      title: `${boardPin.label} has no PWM`,
      detail: `${name} ${pin.label} needs PWM for ${node.partId === "servo" ? "angles" : "dimming and speed"}; ${boardPin.label} can only switch fully on or off. Use a ~ pin.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
  if (board.logic >= 5 && pinout.tolerates5V === false) {
    fault(s, {
      severity: "error",
      key: `level-in:${pin.id}`,
      title: `5 V signal into a 3.3 V input`,
      detail: `${boardName} drives 5 V into ${name} ${pin.label}, which takes 3.3 V. Add a divider or level shifter.`,
      extraNodes: [boardRef.node],
      netWires: net.wires,
    });
  }
}

export function checkDrive(s: PartState, v: PinView) {
  const { pin, net, isWired } = v;
  const { name } = s;
  if (net.kind === "power") {
    s.driven = true;
    s.driveV ??= net.voltage ?? null;
    if (pin.role === "drive" && isWired)
      fault(s, {
        severity: "tip",
        key: `always-on:${pin.id}`,
        title: `${pin.label} is always on`,
        detail: `${pin.label} sits on the ${net.voltage} V rail, so ${name} is on all the time and the board can't switch it.`,
        extraNodes: [],
        netWires: net.wires,
      });
  } else if (net.kind === "ground") {
    if (isWired)
      fault(s, {
        severity: "warning",
        key: `held-low:${pin.id}`,
        title: `${pin.label} is held at ground`,
        detail: `${name} never switches on with ${pin.label} on GND. Wire it to an output pin.`,
        extraNodes: [],
        netWires: net.wires,
      });
  } else if (onBoard(v)) {
    driveFromBoard(s, v);
  } else if (pin.required && s.wired.size > 0) {
    fault(s, {
      severity: "error",
      key: `unwired:${pin.id}`,
      title: `${pin.label} isn't connected`,
      detail: `Wire ${name} ${pin.label} to an output pin on a board.`,
    });
  }
}
