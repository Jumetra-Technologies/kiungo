/**
 * The Arduino Uno R3, laid out as the real board is.
 *
 * Measured from the Rev3 reference design (68.58 × 53.34 mm, USB on the left,
 * digital header along the top, power and analog headers along the bottom),
 * so that every header hole, chip, jack and LED sits where it does on the
 * bench. The lab wires to these holes directly (`canvas`), and the USB lead
 * plugs into the real USB-B jack.
 *
 * The board's hardware design is open (CC BY-SA). The Arduino name and logo
 * are Arduino SA's trademarks, so the silkscreen carries the functional
 * markings only (pin names, DIGITAL, POWER, ANALOG IN, L, TX, RX, ON, ICSP).
 */

import { MATERIAL, capacitor, chip, dip, header, mountHole, pcb, shade, silk, smdLed, tactileButton } from "../build";
import type { CanvasSpec, PartModel, PinInfo, Solid } from "../types";

export const UNO_SIZE = { w: 68.6, h: 53.4, d: 13 } as const;

/** 0.1" header pitch. */
const P = 2.54;

/** Header bodies: x, y of the top-left corner. Holes are at pitch centers inside. */
const HEADERS = {
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
function canvasSpec(): CanvasSpec {
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
const USB = { x: -6.6, y: 7.6, w: 16.2, h: 12.4, d: 10.9 };
/** The DC barrel jack under it. */
const JACK = { x: -2.6, y: 40.4, w: 14.3, h: 9.0, d: 11 };

/** Arduino teal as the solder mask shows it: a little darker and bluer than the brand color. */
const TEAL = "#00878f";
const TRACE = shade(TEAL, 1.11);
const SILK = "#f3f6f4";

/** A copper trace under the mask: a shade lighter than the board. */
const trace = (d: string): Solid => ({ kind: "path", d, color: TRACE, width: 0.38 });

/** Vertical pin names: down from under the top headers, up from above the bottom ones. */
function pinLabels(): Solid[] {
  const out: Solid[] = [];
  TOP10.forEach((name, i) => out.push(silk(holeX(HEADERS.top10, i) + 0.5, 4.4, PWM.has(name) ? `~${name}` : name, 1.3, SILK, { rotate: 90, weight: 600 })));
  TOP8.forEach((name, i) => out.push(silk(holeX(HEADERS.top8, i) + 0.5, 4.4, name === "1" ? "TX→1" : name === "0" ? "RX←0" : PWM.has(name) ? `~${name}` : name, 1.3, SILK, { rotate: 90, weight: 600 })));
  POWER.forEach((name, i) => {
    if (name) out.push(silk(holeX(HEADERS.power, i) - 0.5, 49.3, name, 1.2, SILK, { rotate: -90, weight: 600 }));
  });
  ANALOG.forEach((name, i) => out.push(silk(holeX(HEADERS.analog, i) - 0.5, 49.3, name, 1.2, SILK, { rotate: -90, weight: 600 })));
  return out;
}

/** The traces you can see on the real board: headers to the chips, USB to the bridge, power to the caps. */
function traces(): Solid[] {
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
  out.push(trace(`M ${holeX(HEADERS.power, 7)} 49.4 L ${holeX(HEADERS.power, 7)} 46.2 L 12.4 46.2 L 12.4 44`));
  return out;
}

const UNO_PINS: PinInfo[] = [
  ...["0 (RX)", "1 (TX)", "2", "~3", "4", "~5", "~6", "7", "8", "~9", "~10", "~11", "12", "13"].map(
    (name) => ({ name: `D${name}`, role: name.startsWith("~") ? "pwm" : "digital", note: name.startsWith("~") ? "Digital, with PWM output" : "Digital input/output" }) as PinInfo,
  ),
  { name: "A0–A5", role: "analog", note: "10-bit analog inputs; A4 is SDA and A5 is SCL for I2C" },
  { name: "5V", role: "power", note: "5 V output from the regulator or USB, up to about 500 mA" },
  { name: "3.3V", role: "power", note: "3.3 V output, 50 mA max" },
  { name: "GND", role: "ground", note: "Three ground pins; all connected" },
  { name: "VIN", role: "power", note: "Unregulated input, 7–12 V" },
  { name: "RESET", role: "other", note: "Pull low to reset" },
  { name: "AREF", role: "other", note: "External reference for the analog inputs" },
];

export const ARDUINO_UNO: PartModel = {
  id: "arduino-uno",
  name: "Arduino Uno",
  aka: ["Uno R3", "ATmega328P board"],
  group: "boards",
  rank: 1,
  summary: "The board most people start on: 14 digital pins, 6 analog inputs, 5 V logic, USB-B programming, and forgiving of mistakes.",
  size: { ...UNO_SIZE },
  solids: [
    pcb(UNO_SIZE.w, UNO_SIZE.h, TEAL, MATERIAL.pcbTealEdge, 1.2),
    ...traces(),

    // Connectors on the left edge.
    { kind: "box", id: "usb", x: USB.x, y: USB.y, w: USB.w, h: USB.h, d: USB.d, z: 1.6, top: "linear-gradient(180deg,#dadde2 0 18%,#c3c7cc 18% 82%,#a9aeb5 82%)", side: MATERIAL.steelSide, fill: MATERIAL.steel, radius: 0.5 },
    { kind: "box", x: USB.x + 2.2, y: USB.y + 2.8, w: 1.2, h: 6.8, d: 0.4, z: 1.6 + USB.d, top: "#8f949b", side: "#6b7078", radius: 0.2 },
    { kind: "box", id: "jack", x: JACK.x, y: JACK.y, w: JACK.w, h: JACK.h, d: JACK.d, z: 1.6, top: "linear-gradient(180deg,#3a3c41,#232529)", side: "#111214", fill: "#2a2c30", radius: 0.6 },
    { kind: "box", x: JACK.x + 1, y: JACK.y + 2.6, w: 3.2, h: 3.8, d: 0.3, z: 1.6 + JACK.d, top: "#15161a", side: "#0b0c0e", radius: 1.6 },

    // Headers.
    header(HEADERS.top10.x, HEADERS.top10.y, 10, "x"),
    header(HEADERS.top8.x, HEADERS.top8.y, 8, "x"),
    header(HEADERS.power.x, HEADERS.power.y, 8, "x"),
    header(HEADERS.analog.x, HEADERS.analog.y, 6, "x"),
    // The ICSP headers are male: a low body with pins standing up.
    { kind: "box", x: HEADERS.icsp.x, y: HEADERS.icsp.y, w: 2 * P, h: 3 * P, d: 2.6, z: 1.6, top: MATERIAL.header, side: MATERIAL.headerSide, radius: 0.3 },
    { kind: "box", x: HEADERS.icsp2.x, y: HEADERS.icsp2.y, w: 3 * P, h: 2 * P, d: 2.6, z: 1.6, top: MATERIAL.header, side: MATERIAL.headerSide, radius: 0.3 },
    { kind: "pins", x: HEADERS.icsp.x, y: HEADERS.icsp.y, count: 3, pitch: P, dir: "y", len: 6, rows: 2, z: 1.6 + 2.6 },
    { kind: "pins", x: HEADERS.icsp2.x, y: HEADERS.icsp2.y, count: 3, pitch: P, dir: "x", len: 6, rows: 2, z: 1.6 + 2.6 },

    // Reset button, top left.
    ...tactileButton(4.2, 1.2, 6, "reset-btn"),

    // USB bridge (ATmega16U2) and its 16 MHz crystal.
    chip(18.2, 15.8, 5, 5, "16U2", 0.9),
    { kind: "box", x: 19.6, y: 22.4, w: 3.2, h: 2.5, d: 0.8, z: 1.6, top: "linear-gradient(180deg,#d9dce0,#aeb3ba)", side: MATERIAL.steelSide, fill: MATERIAL.steel, radius: 0.4 },
    // The main 16 MHz crystal (HC-49/S can) lying beside the bridge.
    { kind: "box", x: 15.2, y: 25.6, w: 9.4, h: 4.2, d: 3.2, z: 1.6, top: "linear-gradient(90deg,#c3c7cc,#e6e9ed 40%,#b5bac1)", side: MATERIAL.steelSide, fill: MATERIAL.steel, radius: 2.1 },

    // Regulators and small transistors along the left.
    { kind: "box", x: 5.4, y: 32.6, w: 4.9, h: 2.2, d: 1.5, z: 1.6, top: "#c9ccd1", side: MATERIAL.steelSide, radius: 0.2 },
    { kind: "box", x: 5.4, y: 34.8, w: 4.9, h: 4.1, d: 1.6, z: 1.6, top: "linear-gradient(180deg,#232428,#17181b)", side: MATERIAL.icSide, fill: MATERIAL.ic, radius: 0.3 },
    { kind: "box", x: 8.4, y: 27.4, w: 2.9, h: 1.6, d: 1.1, z: 1.6, top: MATERIAL.ic, side: MATERIAL.icSide, radius: 0.2 },
    { kind: "box", x: 12.4, y: 36.4, w: 2.9, h: 1.6, d: 1.1, z: 1.6, top: MATERIAL.ic, side: MATERIAL.icSide, radius: 0.2 },
    { kind: "box", x: 25.4, y: 23.8, w: 2.9, h: 1.6, d: 1.1, z: 1.6, top: MATERIAL.ic, side: MATERIAL.icSide, radius: 0.2 },

    // The two 47 µF, 25 V electrolytics by the jack.
    ...capacitor(19.6, 44.8, 3.15, 8.6, 1.6),
    ...capacitor(26.5, 44.8, 3.15, 8.6, 1.6),

    // The ATmega328P in its socket, bottom right.
    { kind: "box", x: 29.4, y: 32.5, w: 36.8, h: 9.8, d: 2.0, z: 1.6, top: "#1d1e22", side: "#0f1012", radius: 0.3 },
    ...dip(30.0, 33.6, 14, "ATMEGA328P-PU", 7.6, 3.6),
    { kind: "disc", cx: 31.6, cy: 37.4, r: 0.75, color: "#0d0e10", z: 8.05 },
    { kind: "disc", cx: 33.0, cy: 40.4, r: 0.4, color: "#4b4f56", z: 8.05 },

    // LEDs: L, TX, RX by the bridge; ON by the right edge.
    smdLed(25.6, 10.4, "#ffb020", "led-l"),
    smdLed(27.3, 16.6, "#ffb020", "led-tx"),
    smdLed(27.3, 18.8, "#ffb020", "led-rx"),
    smdLed(58.6, 16.1, "#3ddc84", "led-on"),

    // A few passives for texture.
    { kind: "box", x: 12.2, y: 10.6, w: 2.0, h: 1.2, d: 0.6, z: 1.6, top: "#2a2b2f", side: "#121316", radius: 0.1 },
    { kind: "box", x: 12.2, y: 12.6, w: 2.0, h: 1.2, d: 0.6, z: 1.6, top: "#2a2b2f", side: "#121316", radius: 0.1 },
    { kind: "box", x: 31.4, y: 11.2, w: 2.0, h: 1.2, d: 0.6, z: 1.6, top: "#b58b3b", side: "#7a5c24", radius: 0.1 },
    { kind: "box", x: 31.4, y: 13.4, w: 2.0, h: 1.2, d: 0.6, z: 1.6, top: "#2a2b2f", side: "#121316", radius: 0.1 },
    { kind: "box", x: 54.2, y: 24.6, w: 2.0, h: 1.2, d: 0.6, z: 1.6, top: "#b58b3b", side: "#7a5c24", radius: 0.1 },
    { kind: "box", x: 54.2, y: 27.0, w: 2.0, h: 1.2, d: 0.6, z: 1.6, top: "#2a2b2f", side: "#121316", radius: 0.1 },
    { kind: "box", x: 3.2, y: 24.2, w: 1.2, h: 2.0, d: 0.6, z: 1.6, top: "#2a2b2f", side: "#121316", radius: 0.1 },
    { kind: "box", x: 3.2, y: 27.4, w: 1.2, h: 2.0, d: 0.6, z: 1.6, top: "#2a2b2f", side: "#121316", radius: 0.1 },

    // Mounting holes.
    mountHole(14.0, 2.5),
    mountHole(15.3, 50.7),
    mountHole(66.6, 5.0),
    mountHole(66.6, 33.0),

    // Silkscreen.
    ...pinLabels(),
    silk(31.0, 9.4, "DIGITAL (PWM~)", 1.6, SILK, { weight: 700 }),
    silk(40.6, 45.0, "POWER", 1.5, SILK, { weight: 700 }),
    silk(51.4, 45.0, "ANALOG IN", 1.5, SILK, { weight: 700 }),
    silk(27.8, 11.5, "L", 1.3, SILK, { weight: 700 }),
    silk(24.4, 17.6, "TX", 1.2, SILK, { weight: 700 }),
    silk(24.4, 19.8, "RX", 1.2, SILK, { weight: 700 }),
    silk(61.2, 17.2, "ON", 1.2, SILK, { weight: 700 }),
    silk(62.6, 20.6, "ICSP", 1.2, SILK, { weight: 700 }),
    silk(63.6, 30.8, "1", 1.0, SILK),
    silk(16.4, 9.4, "ICSP2", 1.0, SILK, { rotate: 90 }),
    silk(2.6, 1.2, "RESET", 1.2, SILK, { rotate: 90, weight: 700 }),
    silk(13.0, 33.6, "3.3V", 1.0, SILK),
    silk(0.8, 36.6, "+5V", 1.0, SILK, { rotate: 90 }),
    { kind: "path", d: "M 17.3 5.1 L 17.3 7.2 M 42.9 5.1 L 42.9 7.2 M 44.5 5.1 L 44.5 7.2 M 64.8 5.1 L 64.8 7.2", color: SILK, width: 0.25 },
    { kind: "path", d: "M 29.0 48.2 L 29.0 46.4 M 49.3 48.2 L 49.3 46.4 M 51.0 48.2 L 51.0 46.4 M 66.2 48.2 L 66.2 46.4", color: SILK, width: 0.25 },
  ],
  features: [
    { id: "digital", label: "Digital pins 0–13", kind: "pins", x: HEADERS.top10.x, y: HEADERS.top10.y, w: 47.3, h: P, note: "14 digital inputs and outputs at 5 V. Pins marked ~ can output PWM. 0 and 1 are also the serial port, so leave them free while uploading." },
    { id: "analog", label: "Analog inputs A0–A5", kind: "pins", x: HEADERS.analog.x, y: HEADERS.analog.y, w: 6 * P, h: P, note: "Six 10-bit analog inputs, 0–5 V. They can also be used as digital pins." },
    { id: "power", label: "Power pins", kind: "power", x: HEADERS.power.x, y: HEADERS.power.y, w: 8 * P, h: P, note: "5 V and 3.3 V out, two GND, VIN in (7–12 V), RESET and IOREF." },
    { id: "usb", label: "USB-B port", kind: "port", x: USB.x, y: USB.y, w: USB.w, h: USB.h, note: "Programming and serial over USB; also powers the board at 5 V." },
    { id: "jack", label: "Barrel jack", kind: "port", x: JACK.x, y: JACK.y, w: JACK.w, h: JACK.h, note: "7–12 V DC in. The onboard regulator makes 5 V from it." },
    { id: "mcu", label: "ATmega328P", kind: "chip", x: 30, y: 33.6, w: 35.6, h: 7.6, note: "The microcontroller: 16 MHz, 32 KB flash, 2 KB RAM. In a socket, so it can be replaced." },
    { id: "bridge", label: "ATmega16U2 USB bridge", kind: "chip", x: 18.2, y: 15.8, w: 5, h: 5, note: "Turns the computer's USB into the serial the ATmega328P speaks. It has its own crystal and ICSP header." },
    { id: "led-l", label: "L LED (pin 13)", kind: "led", x: 25.6, y: 10.4, w: 1.6, h: 0.8, note: "Wired to digital pin 13. Blink makes this one flash." },
    { id: "led-on", label: "Power LED", kind: "led", x: 58.6, y: 16.1, w: 1.6, h: 0.8, note: "Lit whenever the board has 5 V." },
    { id: "reset", label: "Reset button", kind: "button", x: 4.2, y: 1.2, w: 6, h: 6, note: "Restarts the sketch from the top." },
    { id: "icsp", label: "ICSP header", kind: "pins", x: HEADERS.icsp.x, y: HEADERS.icsp.y, w: 2 * P, h: 3 * P, note: "In-circuit programming of the ATmega328P with an external programmer. Pin 2, bottom right, carries 5 V." },
    { id: "regulator", label: "5 V regulator", kind: "chip", x: 5.4, y: 32.6, w: 4.9, h: 6.3, note: "NCP1117: drops the barrel jack's 7–12 V to 5 V. Warm to the touch under load." },
    { id: "caps", label: "47 µF capacitors", kind: "other", x: 16.4, y: 41.6, w: 13.3, h: 6.4, note: "Smooth the supply on both sides of the regulator." },
  ],
  pins: UNO_PINS,
  circuit: {
    blocks: [
      { id: "usb", label: "USB-B", sub: "5 V in, serial", kind: "connector", col: 0, row: 0, note: "The computer supplies 5 V and talks serial through the USB bridge." },
      { id: "jack", label: "Barrel jack", sub: "7–12 V in", kind: "connector", col: 0, row: 2, note: "An external supply when USB is not plugged in." },
      { id: "bridge", label: "USB bridge", sub: "ATmega16U2", kind: "ic", col: 1, row: 0, note: "Turns USB into the serial signals the main chip understands." },
      { id: "reg", label: "5 V regulator", sub: "NCP1117", kind: "regulator", col: 1, row: 2, note: "Drops VIN to a steady 5 V. A second regulator makes 3.3 V." },
      { id: "mcu", label: "ATmega328P", sub: "16 MHz", kind: "mcu", col: 2, row: 1, note: "Runs your sketch. Every pin on the headers is one of its pins." },
      { id: "digital", label: "Digital pins", sub: "D0–D13", kind: "pin", col: 3, row: 0, note: "Switch between 0 V and 5 V, source up to 20 mA each." },
      { id: "analog", label: "Analog inputs", sub: "A0–A5", kind: "pin", col: 3, row: 1, note: "Read 0–5 V as 0–1023." },
      { id: "power", label: "Power pins", sub: "5V, 3.3V, GND", kind: "power", col: 3, row: 2, note: "Feed your sensors and modules." },
    ],
    links: [
      { from: "usb", to: "bridge", kind: "data", label: "USB" },
      { from: "usb", to: "reg", kind: "power", label: "5 V" },
      { from: "jack", to: "reg", kind: "power", label: "VIN" },
      { from: "bridge", to: "mcu", kind: "data", label: "TX/RX", both: true },
      { from: "reg", to: "mcu", kind: "power", label: "5 V" },
      { from: "reg", to: "power", kind: "power" },
      { from: "mcu", to: "digital", kind: "signal", both: true },
      { from: "analog", to: "mcu", kind: "analog" },
    ],
    steps: [
      "Power arrives from USB (5 V) or the barrel jack (7–12 V); the regulator settles it at 5 V for the whole board.",
      "The USB bridge chip converts the computer's USB traffic into serial for the ATmega328P, which is how sketches are uploaded.",
      "The ATmega328P runs your sketch at 16 MHz and drives the header pins directly: digital pins switch between 0 and 5 V, analog pins read voltages.",
      "The power pins pass the regulated 5 V and 3.3 V to your sensors and modules; all GND pins join the same ground.",
    ],
  },
  facts: [
    { label: "Logic", value: "5 V" },
    { label: "Clock", value: "16 MHz" },
    { label: "Memory", value: "32 KB flash, 2 KB RAM" },
    { label: "Pins", value: "14 digital (6 PWM), 6 analog" },
    { label: "Input", value: "USB 5 V or 7–12 V DC" },
    { label: "Size", value: "68.6 × 53.4 mm" },
  ],
  animate: { lit: ["led-on", "led-l"] },
  experiment: { title: "Blink", idea: "Flash the pin-13 LED once a second, then change the timing and watch the serial monitor count the blinks." },
  docs: "/docs/hardware-knowledge/arduino-uno",
  tags: ["arduino", "uno", "atmega328p", "5v", "beginner", "mcu", "board"],
  canvas: canvasSpec(),
};
