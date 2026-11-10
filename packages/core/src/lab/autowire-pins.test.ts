import { boardPinFor, pinPicker } from "./autowire-pins";
import { describe, expect, it } from "vitest";
import { planAutoWire } from "./autowire";
import { analyze } from "./circuit";
import { suggest } from "./suggest";
import type { LabNode, LabWire } from "./types";
import { getPart } from "../parts";
import { getPinout } from "./pinout";

const node = (id: string, partId: string, x = 0, y = 0): LabNode => ({
  id,
  partId,
  label: getPart(partId)?.name.split(" (")[0] ?? partId,
  x,
  y,
  mode: "virtual",
});

let seq = 0;

const wire = (a: string, ap: string, b: string, bp: string): LabWire => ({
  id: `w${++seq}`,
  from: { node: a, pin: ap },
  to: { node: b, pin: bp },
});

const uno = node("uno", "arduino-uno", 0, 0);

const bb = node("bb", "breadboard", 420, 0);

/** The Uno's 5 V and GND on the top rails, as the lab wires a new breadboard. */
const fed = () => [wire("uno", "5V", "bb", "TP1"), wire("uno", "GND1", "bb", "TN1")];

describe("Auto-wiring with a breadboard", () => {
  it("feeds the top rails from the board, then takes each part's power from them", () => {
    const plan = planAutoWire(bb, [uno, bb], []);
    expect(plan.board?.id).toBe("uno");
    expect(plan.wires).toEqual([
      { from: { node: "uno", pin: "5V" }, to: { node: "bb", pin: "TP1" } },
      { from: { node: "uno", pin: "GND1" }, to: { node: "bb", pin: "TN1" } },
    ]);
    const wires: LabWire[] = plan.wires.map((w) => ({ id: `w${++seq}`, ...w }));
    const nodes: LabNode[] = [uno, bb];
    const used = new Set<string>();
    for (const [id, partId] of [
      ["dht", "dht11"],
      ["sonar", "hc-sr04"],
      ["servo", "servo"],
    ] as const) {
      const part = node(id, partId, 900, 0);
      nodes.push(part);
      const p = planAutoWire(part, nodes, wires);
      const vcc = p.wires.find((w) => w.to.pin === "VCC")!;
      const gnd = p.wires.find((w) => w.to.pin === "GND")!;
      expect(vcc.from.node, id).toBe("bb");
      expect(vcc.from.pin, id).toMatch(/^TP\d+$/);
      expect(gnd.from.node, id).toBe("bb");
      expect(gnd.from.pin, id).toMatch(/^TN\d+$/);
      // A hole takes one wire.
      expect(used.has(vcc.from.pin)).toBe(false);
      used.add(vcc.from.pin);
      // Signals still go straight to the board.
      expect(p.wires.filter((w) => w.from.node === "uno").length, id).toBeGreaterThan(0);
      wires.push(...p.wires.map((w) => ({ id: `w${++seq}`, ...w })));
    }
    const a = analyze(nodes, wires);
    for (const id of ["dht", "sonar", "servo"]) expect(a.nodes[id]!.status, id).toBe("ready");
    expect(wires.filter((w) => w.from.node === "uno" && w.from.pin === "5V")).toHaveLength(1);
  });

  it("leaves 3.3 V parts on the board's 3.3 V pin when the rail carries 5 V", () => {
    const wires = fed();
    const radio = node("radio", "nrf24l01", 900, 0);
    const p = planAutoWire(radio, [uno, bb, radio], wires);
    expect(p.wires.find((w) => w.to.pin === "VCC")!.from).toEqual({ node: "uno", pin: "3V3" });
    expect(p.wires.find((w) => w.to.pin === "GND")!.from.node).toBe("bb");
  });

  it("is suggested once several parts want 5 V", () => {
    const nodes = [uno, node("dht", "dht11"), node("pir", "pir")];
    const { items } = suggest("", nodes);
    expect(items.find((s) => s.part.id === "breadboard")?.reason).toMatch(
      /2 parts need 5 V and GND/,
    );
  });
});

describe("choosing a board pin for each of a part's pins", () => {
  const pick = (
    boardId: string,
    partId: string,
    pinId: string,
    opts: { x?: number; taken?: string[]; wires?: LabWire[] } = {},
  ) => {
    const board = node("b", boardId, 0, 0);
    const part = node("p", partId, opts.x ?? 500, 0);
    const k = pinPicker(part, board, opts.wires ?? [], {
      used: new Set(),
      taken: new Set(opts.taken ?? []),
    });
    const pin = getPinout(partId).pins.find((p) => p.id === pinId)!;
    return boardPinFor(k, pin)?.id;
  };

  it("an LED's anode goes on the board's own LED pin", () => {
    expect(pick("arduino-uno", "led", "A")).toBe("D13");
  });

  it("supply by the part's voltage, from the side facing the part, a motor's from VIN", () => {
    expect(pick("arduino-uno", "nrf24l01", "VCC")).toBe("3V3");
    const uno = getPinout("arduino-uno").pins;
    const right = uno.find((p) => p.id === pick("arduino-uno", "dht11", "VCC"))!;
    expect(right).toMatchObject({ supplies: 5, side: "right" });
    const left = uno.find((p) => p.id === pick("arduino-uno", "dht11", "VCC", { x: -500 }))!;
    expect(left.supplies).toBe(5);
    expect(left.side).not.toBe("right");
    expect(pick("arduino-uno", "dc-motor", "VM")).toBe("VIN");
  });

  it("buses on their hardware pins, serial crossed and off the USB pins", () => {
    expect(pick("arduino-uno", "lcd-16x2", "SDA")).toBe("A4");
    expect(pick("esp32", "oled-ssd1306", "SCL")).toBe("D22");
    expect(pick("arduino-mega", "hc-05", "TXD")).toBe("D19");
    expect(pick("arduino-mega", "hc-05", "RXD")).toBe("D18");
  });

  it("PWM on a ~ pin, analog on an A pin, and pins already chosen aren't chosen again", () => {
    const pwm = pick("arduino-uno", "servo", "SIG");
    expect(getPinout("arduino-uno").pins.find((p) => p.id === pwm)?.fns).toContain("pwm");
    expect(pick("arduino-uno", "ldr", "L2")).toMatch(/^A\d$/);
    expect(pick("arduino-uno", "led", "A", { taken: ["D13"] })).not.toBe("D13");
  });

  it("nothing for a pin with no role to wire", () => {
    expect(pick("arduino-uno", "dht11", "NC")).toBeUndefined();
  });
});
