import { describe, expect, it } from "vitest";
import { PARTS } from "../parts";
import { getPinout } from "./pinout";
import { analyze } from "./circuit";
import { planAutoWire, placeNode, nodeBox } from "./autowire";
import type { LabNode } from "./types";

let seq = 0;

const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({
  id: `n${++seq}`,
  partId,
  label: label ?? partId,
  x,
  y,
  mode: "virtual",
});

const autowired = (boardId: string, partId: string) => {
  const board = node(boardId, 0, 0, "Board");
  const part = node(partId, 500, 0, "Part");
  const plan = planAutoWire(part, [board, part], []);
  const wires = plan.wires.map((w) => ({ id: `w${++seq}`, ...w }));
  return { board, part, wires, plan, analysis: analyze([board, part], wires) };
};

describe("auto-wiring", () => {
  it("wires every peripheral to an Uno so it is ready, except 3.3 V-only LoRa signals", () => {
    // A resistor has nothing to wire to on its own; its auto-wiring (in series with an LED) is tested in LabAcceptance.
    // A mini breadboard has no rails to feed, so it stays unwired (tested in Breadboard).
    for (const part of PARTS.filter(
      (p) => !getPinout(p.id).controller && p.id !== "resistor" && p.id !== "breadboard-mini",
    )) {
      const { part: n, analysis, plan } = autowired("arduino-uno", part.id);
      expect(plan.skipped, part.id).toEqual([]);
      const errors = analysis.nodes[n.id]!.faults.filter((f) => f.severity === "error");
      if (part.id === "lora") {
        expect(errors.map((f) => f.title)).toContain("5 V signal into a 3.3 V input");
      } else {
        expect(analysis.nodes[n.id]!.status, part.id).toBe("ready");
        expect(errors, part.id).toEqual([]);
      }
    }
  });

  it("powers 3.3 V parts from 3.3 V and puts an LED on the board's LED pin", () => {
    const radio = autowired("arduino-uno", "nrf24l01");
    const vcc = radio.wires.find((w) => w.to.pin === "VCC")!;
    expect(vcc.from.pin).toBe("3V3");
    const led = autowired("arduino-uno", "led");
    expect(led.wires.find((w) => w.to.pin === "A")!.from.pin).toBe("D13");
  });

  it("uses the I²C pins for I²C parts and crosses serial lines", () => {
    const oled = autowired("esp32", "oled-ssd1306");
    expect(oled.wires.find((w) => w.to.pin === "SDA")!.from.pin).toBe("D21");
    expect(oled.wires.find((w) => w.to.pin === "SCL")!.from.pin).toBe("D22");
    const bt = autowired("arduino-mega", "hc-05");
    expect(bt.wires.find((w) => w.to.pin === "TXD")!.from.pin).toBe("D19");
    expect(bt.wires.find((w) => w.to.pin === "RXD")!.from.pin).toBe("D18");
  });

  it("never plans wires without a board", () => {
    const led = node("led");
    expect(planAutoWire(led, [led], []).wires).toEqual([]);
  });

  it("places new parts where they don't overlap", () => {
    const board = node("arduino-uno", 80, 80);
    const a = { ...node("led"), ...placeNode("led", [board], board) };
    const b = { ...node("dht11"), ...placeNode("dht11", [board, a], board) };
    const overlap = (p: LabNode, q: LabNode) => {
      const bp = nodeBox(p.partId);
      const bq = nodeBox(q.partId);
      return p.x < q.x + bq.w && p.x + bp.w > q.x && p.y < q.y + bq.h && p.y + bp.h > q.y;
    };
    expect(overlap(board, a)).toBe(false);
    expect(overlap(a, b)).toBe(false);
    expect(a.x).toBeGreaterThan(board.x);
  });
});
