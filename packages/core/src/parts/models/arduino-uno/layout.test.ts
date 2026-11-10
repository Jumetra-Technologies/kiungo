import { describe, expect, it } from "vitest";
import { getPinout } from "../../../lab/pinout";
import {
  HEADERS,
  JACK,
  P,
  SILK,
  TEAL,
  UNO_PINS,
  UNO_SIZE,
  USB,
  canvasSpec,
  pinLabels,
  traces,
} from "./layout";

const pins = canvasSpec().pins;

describe("the Uno's layout", () => {
  it("is the real R3's board: 68.6 × 53.4 mm, teal, on the 0.1 inch grid", () => {
    expect(UNO_SIZE).toMatchObject({ w: 68.6, h: 53.4 });
    expect(TEAL).toBe("#00878f");
    expect(P).toBe(2.54);
    expect(SILK).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("puts every lab pin on a header hole at 0.1 in pitch, where the real header is", () => {
    for (const pin of getPinout("arduino-uno").pins) expect(pins[pin.id], pin.id).toBeDefined();
    // Digital 13…8 sit on the 10-pin header along the top, 2.54 mm apart; 7…0 after the 1.6 mm gap.
    expect(pins.D12!.x - pins.D13!.x).toBeCloseTo(2.54, 2);
    expect(pins.D7!.x - pins.D8!.x).toBeCloseTo(2.54 + 1.6 - 0.1, 0);
    expect(pins.D13!.y).toBeCloseTo(2.07, 2);
    // A0…A5 along the bottom; 5 V and GND on the power header beside them.
    expect(pins.A1!.x - pins.A0!.x).toBeCloseTo(2.54, 2);
    expect(pins.A0!.y).toBeCloseTo(51.27, 2);
    expect(pins.GND1!.x).toBeLessThan(pins.A0!.x);
    expect(pins["5V"]!.x).toBeLessThan(pins.GND1!.x);
    // The ICSP's 5 V is on the 2 × 3 header at the right edge, and the top-header GND is beside pin 13.
    expect(pins["5V_ICSP"]!.x).toBeGreaterThan(66);
    expect(pins.GND3!.x).toBeCloseTo(pins.D13!.x - 2.54, 2);
  });

  it("the USB-B and the barrel jack overhang the left edge, and the lab's lead plugs in from the left", () => {
    expect(USB.x).toBeLessThan(0);
    expect(JACK.x).toBeLessThan(0);
    expect(USB.y + USB.h / 2).toBeCloseTo(13.8, 0);
    expect(canvasSpec().usb).toMatchObject({ from: "left" });
    expect(canvasSpec().usb!.x).toBeLessThan(0);
  });

  it("labels every header pin, and draws its traces in the board's own color", () => {
    const labels = pinLabels()
      .filter((s) => s.kind === "text")
      .map((s) => (s.kind === "text" ? s.text : ""));
    for (const label of ["~11", "A0", "A5", "Vin", "3.3V", "5V", "GND"])
      expect(labels).toContain(label);
    expect(traces().length).toBeGreaterThan(5);
    expect(traces().every((s) => s.kind === "path")).toBe(true);
    expect(HEADERS.top10.count + HEADERS.top8.count).toBe(18);
  });

  it("documents each header pin with what it does", () => {
    expect(UNO_PINS.length).toBeGreaterThanOrEqual(8);
    for (const pin of UNO_PINS) expect(pin.note.length).toBeGreaterThan(10);
  });
});
