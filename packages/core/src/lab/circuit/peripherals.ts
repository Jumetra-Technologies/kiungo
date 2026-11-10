import type { LabPin } from "../pinout";
import type { LabNode } from "../types";
import { breadboardStrip, netFor, throughResistor, type Circuit } from "./context";
import { nameOf } from "./nets";
import { fault, newPartState, type PartState, type PinView } from "./part-state";
import { checkDrive, checkGnd, checkVcc } from "./pin-checks";
import { checkSignal } from "./signal-checks";
import { LED_FORWARD_V, LED_MAX_MA, ledCurrentMa, type PartStatus } from "./types";

/** The net a pin reaches (through a resistor, for anything but a supply) and the board pin on it. */
function viewPin(c: Circuit, s: PartState, pin: LabPin): PinView | null {
  const direct = netFor(c, { node: s.node.id, pin: pin.id });
  if (!direct) return null;
  // A supply is never taken through a resistor; everything else may be.
  const hop = pin.role === "vcc" ? { net: direct, ohms: 0 } : throughResistor(c, direct);
  const net = hop.net;
  if (hop.ohms && (pin.role === "drive" || pin.role === "pwm" || pin.role === "gnd"))
    s.seriesOhms += hop.ohms;
  const boardRef = net.pins.find(
    (r) => c.isBoard(r.node) && !c.pinOf(r)?.supplies && !c.pinOf(r)?.fns?.includes("ground"),
  );
  const boardPin = boardRef ? c.pinOf(boardRef) : undefined;
  if (boardRef && boardPin)
    s.links.push({
      board: boardRef.node,
      boardPin: boardPin.id,
      pin: pin.id,
      role: pin.role ?? "opt",
    });
  return {
    pin,
    net,
    boardRef,
    boardPin,
    board: boardRef ? c.pinouts.get(boardRef.node) : undefined,
    boardName: boardRef ? nameOf(c.byId.get(boardRef.node)!) : "",
    isWired: s.wired.has(pin.id),
  };
}

const SIGNAL_ROLES = new Set([
  "out-digital",
  "out-analog",
  "io",
  "sda",
  "scl",
  "tx",
  "rx",
  "mosi",
  "miso",
  "sck",
]);

function checkPin(s: PartState, v: PinView) {
  const role = v.pin.role;
  if (role === "vcc") checkVcc(s, v);
  else if (role === "gnd") checkGnd(s, v);
  else if (role === "drive" || role === "pwm" || role === "cs") checkDrive(s, v);
  else if (role && SIGNAL_ROLES.has(role)) checkSignal(s, v);
}

/** "Any of" groups: at least one signal pin must be used. */
function checkAnySignal(s: PartState) {
  const { pinout, wired, links } = s;
  const optionalSignals = pinout.pins.filter(
    (p) => !p.required && p.role && !["opt", "load", "vcc", "gnd"].includes(p.role),
  );
  const requiredSignals = pinout.pins.filter(
    (p) => p.required && p.role && !["vcc", "gnd"].includes(p.role),
  );
  if (
    !requiredSignals.length &&
    optionalSignals.length &&
    wired.size > 0 &&
    !optionalSignals.some((p) => links.some((l) => l.pin === p.id))
  ) {
    fault(s, {
      severity: "error",
      key: "no-signal",
      title: `No signal pin connected`,
      detail: `Wire one of ${optionalSignals.map((p) => p.label).join(", ")} to a board pin.`,
    });
  }
}

function wantedSupply(supply: [number, number] | undefined): string {
  if (supply && supply[1] < 4) return "3.3 V";
  if (supply && supply[0] > 3.6) return "5 V";
  return "3.3 V or 5 V";
}

function checkPowerAndGround(c: Circuit, s: PartState) {
  const { pinout, name, node } = s;
  const hasVcc = pinout.pins.some((p) => p.role === "vcc");
  const hasGnd = pinout.pins.some((p) => p.role === "gnd");
  if (hasVcc && !s.poweredByRail && !s.faults.some((f) => f.id.startsWith("vcc-gnd"))) {
    const vcc = pinout.pins.find((p) => p.role === "vcc")!;
    const want = wantedSupply(pinout.supply);
    const vccNet = netFor(c, { node: node.id, pin: vcc.id });
    const strip = vccNet ? breadboardStrip(c, vccNet) : null;
    fault(s, {
      severity: "error",
      key: "no-power",
      title: "No power",
      detail: strip
        ? `${name} ${vcc.label} is on the breadboard's ${strip}, which has no supply yet. Wire a board's ${want} pin to it.`
        : `${name} ${vcc.label} isn't on a supply. Wire it to ${want}.`,
    });
  }
  if (hasGnd && !s.grounded && !s.faults.some((f) => f.id.startsWith("gnd-vcc"))) {
    const g = pinout.pins.find((p) => p.role === "gnd")!;
    const gNet = netFor(c, { node: node.id, pin: g.id });
    const strip = gNet ? breadboardStrip(c, gNet) : null;
    fault(s, {
      severity: "error",
      key: "no-ground",
      title: "No path to ground",
      detail: strip
        ? `${name} ${g.label} is on the breadboard's ${strip}, which isn't wired to GND. Wire a board's GND pin to it.`
        : `${name} ${g.label} isn't on GND, so no current can flow through it. Wire it to a GND pin.`,
    });
  }
}

function checkLedCurrent(s: PartState) {
  if (s.node.partId !== "led" || !s.driven || !s.grounded) return;
  const v = s.driveV ?? 5;
  const { seriesOhms } = s;
  if (seriesOhms > 0) {
    // A real resistor: the current follows from its value.
    const ma = ledCurrentMa(v, seriesOhms);
    if (ma > LED_MAX_MA) {
      const min = Math.ceil(((v - LED_FORWARD_V) / LED_MAX_MA) * 1000);
      fault(s, {
        severity: "warning",
        key: "too-much-current",
        title: `${ma.toFixed(0)} mA: more than the LED takes`,
        detail: `With ${seriesOhms} Ω from a ${v} V pin, about ${ma.toFixed(1)} mA flows; an LED takes about ${LED_MAX_MA} mA. Use at least ${min} Ω (220 Ω is the usual choice).`,
      });
    }
  } else {
    // No resistor part wired: the model assumes the 220 Ω a real build needs; the LED's
    // Live panel shows the same current (ledCurrentMa). Advisory, not a fault.
    const ma = ledCurrentMa(v).toFixed(1);
    fault(s, {
      severity: "tip",
      key: "resistor",
      title: "Assumed: 220 Ω resistor in series",
      detail: `No resistor is wired, so the lab models this LED as if a 220 Ω resistor sat between the ${v} V pin and the anode: about ${ma} mA when on. Add a Resistor part between the pin and the anode; on a real board an LED wired straight to a pin draws too much current and can damage the LED and the pin.`,
    });
  }
}

function statusOf(s: PartState, powered: boolean, hasGnd: boolean): PartStatus {
  const errors = s.faults.filter((f) => f.severity === "error");
  const signalsOk = s.pinout.pins
    .filter((p) => p.required && p.role && !["vcc", "gnd"].includes(p.role))
    .every(
      (p) =>
        s.links.some((l) => l.pin === p.id) ||
        (p.role === "drive" && s.driven) ||
        (p.role === "vcc" && s.poweredByRail),
    );
  if (s.wired.size === 0) return "idle";
  if (errors.length) return "fault";
  if (powered && (s.grounded || !hasGnd) && signalsOk) return "ready";
  if (powered) return "partial";
  return "unpowered";
}

function reportPart(c: Circuit, node: LabNode) {
  const pinout = c.pinouts.get(node.id)!;
  const s = newPartState(node, pinout, nameOf(node), c.wiredPins.get(node.id) ?? new Set<string>());
  // Supply first: a part's output level depends on what powers it.
  const ordered = [...pinout.pins].sort(
    (a, b) => (a.role === "vcc" ? 0 : 1) - (b.role === "vcc" ? 0 : 1),
  );
  for (const pin of ordered) {
    const view = viewPin(c, s, pin);
    if (view) checkPin(s, view);
  }
  checkAnySignal(s);

  const hasVcc = pinout.pins.some((p) => p.role === "vcc");
  const hasGnd = pinout.pins.some((p) => p.role === "gnd");
  const powered = hasVcc ? s.poweredByRail : s.driven;
  if (s.wired.size > 0) {
    checkPowerAndGround(c, s);
    checkLedCurrent(s);
  }
  c.reports[node.id] = {
    status: statusOf(s, powered, hasGnd),
    powered: powered && (s.grounded || !hasGnd),
    grounded: s.grounded,
    supplyV: s.supplyV,
    links: s.links,
    faults: s.faults,
    wiredPins: s.wired,
    seriesOhms: s.seriesOhms,
  };
  c.faults.push(...s.faults);
}

/** Every part that isn't a board or a breadboard, checked against what its pins expect. */
export function reportPeripherals(c: Circuit) {
  for (const node of c.nodes) {
    const pinout = c.pinouts.get(node.id)!;
    if (!pinout.controller && !pinout.passive) reportPart(c, node);
  }
}
