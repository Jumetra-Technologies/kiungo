/**
 * Electrical checks before a run on a real board (SAF-03). The lab's own
 * analysis already finds shorts, wrong voltages and missing grounds; these
 * add what matters once real current flows from a real board:
 *
 * - Pins 0 and 1 carry Kiungo's link in a Hybrid run, so nothing else may use them.
 * - A motor needs its own supply: on the board's 5 V pin it browns the board out.
 *   VIN is fine: it carries the barrel jack's battery, past the regulator.
 * - An LED without its resistor burns out the LED and the pin.
 * - What the board's 5 V pin feeds should stay inside what USB gives (500 mA).
 *
 * Errors stop Run; warnings are shown in Problems and Run goes ahead. Only
 * the board and parts on the desk (marked Physical) are checked: the lab's
 * virtual parts draw nothing from the real board.
 */

import type { Analysis, Fault } from "../lab/circuit";
import { getPinout } from "../lab/pinout";
import type { LabNode, LabWire } from "../lab/types";
import { boardIsReal, isVirtual } from "./plan";

/** About what each part draws in use, in mA: enough to see when the USB port's 500 mA runs out. */
export const TYPICAL_MA: Record<string, number> = {
  led: 15,
  "rgb-led": 45,
  buzzer: 30,
  servo: 300,
  "dc-motor": 400,
  "stepper-motor": 240,
  relay: 70,
  "hc-sr04": 15,
  dht11: 2,
  dht22: 2,
  am2302: 2,
  pir: 1,
  ldr: 1,
  ds18b20: 2,
  "soil-moisture": 10,
  mq2: 160,
  mpu6050: 4,
  bmp280: 1,
  "lcd-16x2": 30,
  "oled-ssd1306": 20,
  "tft-display": 80,
  "hc-05": 40,
  "wifi-module": 250,
  nrf24l01: 15,
  lora: 120,
};

/** What USB gives a board, in mA. */
export const USB_MA = 500;

/** Motors that must have their own supply. */
const MOTORS = new Set(["dc-motor", "stepper-motor"]);

/**
 * The checks for running on the real board `boardId`. Nothing when the board
 * isn't marked Physical or Hybrid.
 */
export function realBoardFaults(
  nodes: LabNode[],
  wires: LabWire[],
  analysis: Analysis,
  boardId: string,
): Fault[] {
  const board = nodes.find((n) => n.id === boardId);
  if (!board || !boardIsReal(board)) return [];
  const faults: Fault[] = [];
  const boardPins = getPinout(board.partId).pins;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Wires and breadboard clips, but not the board's own joins: the lab counts VIN, 5V and the ICSP 5 V as one
  // net, while on the bench VIN is the barrel jack's supply and the others come through the regulator or USB.
  const links = new Map<string, string[]>();
  const join = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (const w of wires) join(`${w.from.node}:${w.from.pin}`, `${w.to.node}:${w.to.pin}`);
  for (const n of nodes)
    for (const strip of getPinout(n.partId).strips ?? [])
      for (let i = 1; i < strip.length; i++) join(`${n.id}:${strip[0]}`, `${n.id}:${strip[i]}`);

  /** The board's regulated supply pin (5 V, 3.3 V) a part's supply pin reaches, if any. VIN doesn't count. */
  const boardSupply = (node: LabNode, pinId: string) => {
    const seen = new Set([`${node.id}:${pinId}`]);
    const queue = [...seen];
    while (queue.length) {
      const key = queue.shift()!;
      for (const next of links.get(key) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        const [nodeId, pin] = [next.slice(0, next.indexOf(":")), next.slice(next.indexOf(":") + 1)];
        if (nodeId === boardId) {
          const p = boardPins.find((b) => b.id === pin);
          if (p?.supplies !== undefined && p.id !== "VIN") return p;
          continue;
        }
        queue.push(next);
      }
    }
    return undefined;
  };

  let drawMa = 0;
  const drawn: string[] = [];
  for (const node of nodes) {
    if (node.id === boardId) continue;
    const report = analysis.nodes[node.id];
    if (!report) continue;
    // Pins 0 and 1 are the link's, for every part: a virtual one too would fight it.
    for (const link of report.links) {
      if (link.board !== boardId || (link.boardPin !== "D0" && link.boardPin !== "D1")) continue;
      faults.push({
        id: `real-uart:${node.id}:${link.pin}`,
        severity: "error",
        title: `${link.boardPin} is Kiungo's link`,
        detail: `In a run on the real board, pins 0 and 1 carry the link between the board and Kiungo. Move ${node.label} ${link.pin} to another pin, in the lab and on your desk.`,
        nodes: [node.id, boardId],
        wires: [],
      });
    }
    if (isVirtual(node)) continue;
    const pinout = getPinout(node.partId);
    const vcc = pinout.pins.find((p) => p.role === "vcc");
    const supply = vcc ? boardSupply(node, vcc.id) : undefined;
    if (supply) {
      drawMa += TYPICAL_MA[node.partId] ?? 10;
      drawn.push(node.label);
    }
    if (MOTORS.has(node.partId) && supply) {
      faults.push({
        id: `real-motor-supply:${node.id}`,
        severity: node.partId === "dc-motor" ? "error" : "warning",
        title: `${node.label} runs from the board's ${supply.label}`,
        detail: `A motor draws ${TYPICAL_MA[node.partId]} mA or more, and much more as it starts or stalls. From the board's ${supply.label} pin it can reset the board or damage its regulator or your USB port. Move its VM to VIN and power the board from a battery pack on the barrel jack, or give the motor its own battery pack with its GND joined to the board's.`,
        nodes: [node.id, boardId],
        wires: [],
      });
    }
    if (node.partId === "servo" && supply) {
      faults.push({
        id: `real-servo-supply:${node.id}`,
        severity: "warning",
        title: `${node.label} runs from the board's ${supply.label}`,
        detail: `A small servo can take the board's 5 V, but as it starts it pulls enough to reset the board. If the board restarts when the servo moves, power it from a separate 5 V supply with GNDs joined.`,
        nodes: [node.id, boardId],
        wires: [],
      });
    }
    // On a real board an LED without a resistor isn't a warning: it burns out.
    for (const f of report.faults) {
      if (f.id.startsWith("too-much-current:"))
        faults.push({
          ...f,
          id: `real-${f.id}`,
          severity: "error",
          detail: `${f.detail} On the real board this damages the LED and the pin.`,
        });
    }
  }

  if (drawMa > USB_MA * 0.8) {
    faults.push({
      id: `real-budget:${boardId}`,
      severity: drawMa > USB_MA ? "error" : "warning",
      title: `About ${drawMa} mA from the board's supply`,
      detail: `${drawn.join(", ")} together draw about ${drawMa} mA from ${byId.get(boardId)?.label ?? "the board"}. USB gives ${USB_MA} mA. Give the hungriest parts their own supply, with GNDs joined.`,
      nodes: [boardId],
      wires: [],
    });
  }
  return faults;
}

/** The analysis with extra faults added: to the list, to their parts' reports, and to the parts' status. */
export function withFaults(analysis: Analysis, extra: Fault[]): Analysis {
  if (!extra.length) return analysis;
  const nodes = { ...analysis.nodes };
  for (const f of extra) {
    for (const id of f.nodes) {
      const report = nodes[id];
      if (!report) continue;
      nodes[id] = {
        ...report,
        faults: [...report.faults, f],
        status: f.severity === "error" ? "fault" : report.status,
      };
    }
  }
  const order = { error: 0, warning: 1, tip: 2 } as const;
  return {
    ...analysis,
    nodes,
    faults: [...analysis.faults, ...extra].sort((a, b) => order[a.severity] - order[b.severity]),
  };
}

/**
 * Faults that can damage something when real current flows: a short, two
 * outputs fighting, the wrong voltage, supply and ground swapped, and the
 * real-board checks above. A part that isn't wired yet only doesn't work.
 */
const DAMAGE = new Set([
  "short",
  "conflict",
  "contention",
  "level",
  "over",
  "vcc-gnd",
  "gnd-vcc",
  "level-in",
  "level-out",
  "uart",
  "uart-cross",
]);
const kindOf = (f: Fault) => f.id.split(":")[0];

/** What stops a run on the real board: errors that could damage the board or a part on the desk. */
export function blockingFaults(nodes: LabNode[], analysis: Analysis, boardId: string): Fault[] {
  const onDesk = new Set(nodes.filter((n) => n.id === boardId || !isVirtual(n)).map((n) => n.id));
  return analysis.faults.filter(
    (f) =>
      f.severity === "error" &&
      (kindOf(f).startsWith("real-") || DAMAGE.has(kindOf(f))) &&
      f.nodes.some((id) => onDesk.has(id)),
  );
}
