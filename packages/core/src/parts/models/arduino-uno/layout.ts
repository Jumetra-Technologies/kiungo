import { type CanvasSpec, type PinInfo, type Solid } from "../../types";
import { shade, silk } from "../../shapes";

export const UNO_SIZE = { w: 68.6, h: 53.4, d: 13 } as const;

/** 0.1" header pitch. */
export const P = 2.54;

/** Header bodies: x, y of the top-left corner. Holes are at pitch centers inside. */
export const HEADERS = {
  /** SCL SDA AREF GND 13 12 11 10 9 8, along the top. */
  top10: { x: 17.5, y: 0.8, count: 10 },
  /** 7 6 5 4 3 2 1 0, along the top (the famous 0.16" gap after the 10-pin). */
  top8: { x: 44.5, y: 0.8, count: 8 },
  /** NC IOREF RESET 3.3V 5V GND GND VIN, along the bottom. */
  power: { x: 29.0, y: 50.0, count: 8 },
  /** A0–A5, along the bottom. */
  analog: { x: 51.0, y: 50.0, count: 6 },
  /** The ATmega328P's ICSP, 2 × 3 on the right edge. */
  icsp: { x: 63.3, y: 21.6, count: 3 },
  /** The 16U2's ICSP, 3 × 2 near the USB jack. */
  icsp2: { x: 17.3, y: 9.5, count: 3 },
} as const;

const holeX = (h: { x: number }, i: number) => h.x + P / 2 + i * P;

const holeY = (h: { y: number }) => h.y + P / 2;

const TOP10 = ["SCL", "SDA", "AREF", "GND", "13", "12", "11", "10", "9", "8"];

const TOP8 = ["7", "6", "5", "4", "3", "2", "1", "0"];

const POWER = ["", "IOREF", "RESET", "3.3V", "5V", "GND", "GND", "Vin"];

const ANALOG = ["A0", "A1", "A2", "A3", "A4", "A5"];

const PWM = new Set(["3", "5", "6", "9", "10", "11"]);

/** Where each lab pinout pin is on the board. Ids match lib/lab/pinout.ts. */
export function canvasSpec(): CanvasSpec {
  const pins: CanvasSpec["pins"] = {};
  TOP10.forEach((name, i) => {
    const at = { x: holeX(HEADERS.top10, i), y: holeY(HEADERS.top10) };
    if (/^\d+$/.test(name)) pins[`D${name}`] = at;
    else if (name === "GND") pins.GND3 = at;
  });
  TOP8.forEach((name, i) => {
    pins[`D${name}`] = { x: holeX(HEADERS.top8, i), y: holeY(HEADERS.top8) };
  });
  const powerIds: Record<string, string> = { "3.3V": "3V3", "5V": "5V", Vin: "VIN" };
  let gnd = 0;
  POWER.forEach((name, i) => {
    const at = { x: holeX(HEADERS.power, i), y: holeY(HEADERS.power) };
    if (name === "GND") pins[`GND${++gnd}`] = at;
    else if (powerIds[name]) pins[powerIds[name]] = at;
  });
  ANALOG.forEach((name, i) => {
    pins[name] = { x: holeX(HEADERS.analog, i), y: holeY(HEADERS.analog) };
  });
  // ICSP pin 2 (VCC) is the bottom-right hole: pin 1 is marked at the bottom-left.
  pins["5V_ICSP"] = { x: HEADERS.icsp.x + P / 2 + P, y: HEADERS.icsp.y + P / 2 + 2 * P };
  return { pins, usb: { x: USB.x, y: USB.y + USB.h / 2, z: 1.6 + USB.d / 2, from: "left" } };
}

/** The USB-B jack: 16 mm long, 12.4 wide, 10.9 tall, overhanging the edge by 6.6 mm. */
export const USB = { x: -6.6, y: 7.6, w: 16.2, h: 12.4, d: 10.9 };

/** The DC barrel jack under it. */
export const JACK = { x: -2.6, y: 40.4, w: 14.3, h: 9.0, d: 11 };

/** Arduino teal as the solder mask shows it: a little darker and bluer than the brand color. */
export const TEAL = "#00878f";

const TRACE = shade(TEAL, 1.11);

export const SILK = "#f3f6f4";

/** A copper trace under the mask: a shade lighter than the board. */
const trace = (d: string): Solid => ({ kind: "path", d, color: TRACE, width: 0.38 });

/** Vertical pin names: down from under the top headers, up from above the bottom ones. */
export function pinLabels(): Solid[] {
  const out: Solid[] = [];
  TOP10.forEach((name, i) =>
    out.push(
      silk({
        x: holeX(HEADERS.top10, i) + 0.5,
        y: 4.4,
        text: PWM.has(name) ? `~${name}` : name,
        size: 1.3,
        color: SILK,
        extra: {
          rotate: 90,
          weight: 600,
        },
      }),
    ),
  );
  TOP8.forEach((name, i) =>
    out.push(
      silk({
        x: holeX(HEADERS.top8, i) + 0.5,
        y: 4.4,
        text: name === "1" ? "TX→1" : name === "0" ? "RX←0" : PWM.has(name) ? `~${name}` : name,
        size: 1.3,
        color: SILK,
        extra: { rotate: 90, weight: 600 },
      }),
    ),
  );
  POWER.forEach((name, i) => {
    if (name)
      out.push(
        silk({
          x: holeX(HEADERS.power, i) - 0.5,
          y: 49.3,
          text: name,
          size: 1.2,
          color: SILK,
          extra: { rotate: -90, weight: 600 },
        }),
      );
  });
  ANALOG.forEach((name, i) =>
    out.push(
      silk({
        x: holeX(HEADERS.analog, i) - 0.5,
        y: 49.3,
        text: name,
        size: 1.2,
        color: SILK,
        extra: { rotate: -90, weight: 600 },
      }),
    ),
  );
  return out;
}

/** The traces you can see on the real board: headers to the chips, USB to the bridge, power to the caps. */
export function traces(): Solid[] {
  const out: Solid[] = [];
  // D13…D8 down to the 328's top row of legs.
  [4, 5, 6, 7, 8, 9].forEach((i, k) => {
    const x = holeX(HEADERS.top10, i);
    const tx = 34 + k * 2.54;
    out.push(trace(`M ${x} 3.4 L ${x} ${13 + k * 1.2} L ${tx} ${20 + k * 1.2} L ${tx} 32.2`));
  });
  // D7…D2 down to the 328.
  [0, 1, 2, 3, 4, 5].forEach((i, k) => {
    const x = holeX(HEADERS.top8, i);
    const tx = 50.2 + k * 2.54;
    out.push(trace(`M ${x} 3.4 L ${x} ${11 + k * 1.1} L ${tx} ${24 + k * 1.1} L ${tx} 32.2`));
  });
  // A0…A5 up to the 328's bottom row.
  ANALOG.forEach((_, i) => {
    const x = holeX(HEADERS.analog, i);
    out.push(trace(`M ${x} 49.4 L ${x} 44.2`));
  });
  // Serial between the USB bridge and the 328, and USB data into the bridge.
  out.push(trace("M 23.2 17.2 L 28.6 17.2 L 28.6 30.4 L 31.2 33"));
  out.push(trace("M 23.2 18.6 L 27.6 18.6 L 27.6 31 L 30.2 33.6"));
  out.push(trace("M 9.6 12.4 L 15.6 12.4 L 18.2 16.2"));
  out.push(trace("M 9.6 14.6 L 14.8 14.6 L 18.2 18.4"));
  // Power from the regulator to the caps and the 5 V pin.
  out.push(trace("M 10.3 36.6 L 15.8 36.6 L 15.8 44.8"));
  out.push(trace("M 29.6 44.8 L 33 44.8 L 33 49.4"));
  out.push(
    trace(
      `M ${holeX(HEADERS.power, 7)} 49.4 L ${holeX(HEADERS.power, 7)} 46.2 L 12.4 46.2 L 12.4 44`,
    ),
  );
  return out;
}

export const UNO_PINS: PinInfo[] = [
  ...["0 (RX)", "1 (TX)", "2", "~3", "4", "~5", "~6", "7", "8", "~9", "~10", "~11", "12", "13"].map(
    (name) =>
      ({
        name: `D${name}`,
        role: name.startsWith("~") ? "pwm" : "digital",
        note: name.startsWith("~") ? "Digital, with PWM output" : "Digital input/output",
      }) as PinInfo,
  ),
  { name: "A0–A5", role: "analog", note: "10-bit analog inputs; A4 is SDA and A5 is SCL for I2C" },
  { name: "5V", role: "power", note: "5 V output from the regulator or USB, up to about 500 mA" },
  { name: "3.3V", role: "power", note: "3.3 V output, 50 mA max" },
  { name: "GND", role: "ground", note: "Three ground pins; all connected" },
  { name: "VIN", role: "power", note: "Unregulated input, 7–12 V" },
  { name: "RESET", role: "other", note: "Pull low to reset" },
  { name: "AREF", role: "other", note: "External reference for the analog inputs" },
];
