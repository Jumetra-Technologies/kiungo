import { describe, expect, it } from "vitest";
import type { Solid } from "../types";
import { barrelJack, microUsb, usbA, usbB, usbC } from "./connectors";
import { PCB_TOP } from "./materials";

type Box = Extract<Solid, { kind: "box" }>;
const boxes = (solids: Solid[]) => solids.filter((s): s is Box => s.kind === "box");

describe("connectors", () => {
  it("sockets open on the edge they face", () => {
    const [shell, mouth, insert] = boxes(usbB(-6, 5, PCB_TOP, "left"));
    expect(mouth!.x).toBeLessThan(shell!.x + 1);
    expect(insert!.top).toBe("#eceae4"); // USB-B's white tongue
    const [s2, slot] = boxes(microUsb(20, -1, PCB_TOP, "top"));
    expect([s2!.w, s2!.h]).toEqual([7.5, 5.6]); // 7.5 wide along the top edge, 5.6 deep into the board
    expect(slot!.y).toBeLessThan(s2!.y + 1);
  });

  it("turning a socket to another edge swaps its width and depth", () => {
    const [left] = boxes(usbC(0, 0, PCB_TOP, "left"));
    const [top] = boxes(usbC(0, 0, PCB_TOP, "top"));
    expect([left!.w, left!.h]).toEqual([top!.h, top!.w]);
  });

  it("a USB-A socket is a steel shell with its opening and a tongue, black for USB 2 unless asked otherwise", () => {
    const [shell, opening, tongue] = boxes(usbA(0, 0));
    expect(shell).toMatchObject({ id: "usb", finish: "metal", d: 7 });
    expect(opening!.top).toBe("#0c0d0f");
    expect(tongue!.top).toBe("#1d1e22");
    expect(boxes(usbA(0, 0, 1.6, "left", "#2b5fd9"))[2]!.top).toBe("#2b5fd9"); // USB 3's blue
  });

  it("a barrel jack's round socket points out of the board edge", () => {
    const jack = barrelJack(0, 0, PCB_TOP, "left");
    const round = jack.filter((s) => s.kind === "cyl");
    expect(round.length).toBeGreaterThan(0);
    expect(round.every((s) => (s as { axis?: string }).axis === "x")).toBe(true);
    const down = barrelJack(0, 0, PCB_TOP, "top").filter((s) => s.kind === "cyl");
    expect(down.every((s) => (s as { axis?: string }).axis === "y")).toBe(true);
  });
});
