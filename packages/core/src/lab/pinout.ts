/**
 * Wireable pins for every part in the catalog.
 *
 * The part models in `lib/parts` describe pins for people ("D0–D13"); the lab
 * needs one entry per pin a wire can land on, with what each pin can do. Board
 * tables list the pins a project actually uses (power, every GPIO on the small
 * boards, a sensible subset on the Mega, Pi and Teensy). Peripheral pins say
 * what the part expects from the other end of the wire.
 */

import { BREADBOARD_SPECS, type BreadboardSpec } from "../parts/models/breadboard";

export type PinFn = "power" | "ground" | "digital" | "analog" | "pwm" | "sda" | "scl" | "tx" | "rx" | "mosi" | "miso" | "sck" | "cs" | "led";

/** What a peripheral pin expects from the far end of its wire. */
export type PinRole =
  | "vcc" // needs a supply
  | "gnd" // needs ground
  | "drive" // driven by a board output (digital or PWM)
  | "pwm" // driven by a board PWM output
  | "out-digital" // the part drives it, a board reads it
  | "out-analog" // the part outputs a voltage, an analog pin reads it
  | "io" // single-wire data both ways
  | "sda"
  | "scl"
  | "tx" // the part transmits on it
  | "rx" // the part receives on it
  | "mosi"
  | "miso"
  | "sck"
  | "cs"
  | "load" // the switched side of a relay
  | "opt"; // optional

export interface LabPin {
  id: string;
  label: string;
  side: "left" | "right";
  /** Board pins: what the pin can do. */
  fns?: PinFn[];
  /** Board power pins: the voltage they supply. */
  supplies?: number;
  /** Board pins that can only read (no output driver). */
  inputOnly?: boolean;
  /** Peripheral pins: what the far end should be. */
  role?: PinRole;
  /** Must be connected for the part to work. */
  required?: boolean;
  note?: string;
}

export interface Pinout {
  partId: string;
  controller: boolean;
  /** Logic level in volts: what a board outputs, or what a peripheral's signals run at. */
  logic: number;
  /** Peripheral inputs that survive 5 V, or a board whose inputs do. */
  tolerates5V: boolean | "some";
  /** Peripheral supply range in volts. */
  supply?: [number, number];
  pins: LabPin[];
  /**
   * A passive part that only joins pins (a breadboard): it has no supply, no
   * signals and nothing to check, and its `strips` are joined inside it.
   */
  passive?: boolean;
  /** Groups of pin ids joined inside the part, as a breadboard's strips are. */
  strips?: readonly string[][];
}

// ----- helpers ---------------------------------------------------------------

const L = "left" as const;
const R = "right" as const;

function bp(id: string, label: string, side: "left" | "right", fns: PinFn[], extra: Partial<LabPin> = {}): LabPin {
  return { id, label, side, fns, ...extra };
}
const vout = (id: string, label: string, volts: number, side: "left" | "right" = L): LabPin => ({ id, label, side, fns: ["power"], supplies: volts, note: `${volts} V out` });
const gnd = (id: string, side: "left" | "right" = L, label = "GND"): LabPin => ({ id, label, side, fns: ["ground"], note: "Ground" });

function pp(id: string, label: string, role: PinRole, required = role !== "opt" && role !== "load", note?: string): LabPin {
  return { id, label, side: L, role, required, note };
}

// ----- boards ----------------------------------------------------------------

const UNO: Pinout = {
  partId: "arduino-uno",
  controller: true,
  logic: 5,
  tolerates5V: true,
  pins: [
    vout("VIN", "VIN", 5),
    vout("5V", "5V", 5),
    vout("3V3", "3.3V", 3.3),
    gnd("GND1"),
    gnd("GND2"),
    bp("A0", "A0", L, ["analog", "digital"]),
    bp("A1", "A1", L, ["analog", "digital"]),
    bp("A2", "A2", L, ["analog", "digital"]),
    bp("A3", "A3", L, ["analog", "digital"]),
    bp("A4", "A4 SDA", L, ["analog", "digital", "sda"]),
    bp("A5", "A5 SCL", L, ["analog", "digital", "scl"]),
    bp("D0", "D0 RX", R, ["digital", "rx"]),
    bp("D1", "D1 TX", R, ["digital", "tx"]),
    bp("D2", "D2", R, ["digital"]),
    bp("D3", "D3 ~", R, ["digital", "pwm"]),
    bp("D4", "D4", R, ["digital"]),
    bp("D5", "D5 ~", R, ["digital", "pwm"]),
    bp("D6", "D6 ~", R, ["digital", "pwm"]),
    bp("D7", "D7", R, ["digital"]),
    bp("D8", "D8", R, ["digital"]),
    bp("D9", "D9 ~", R, ["digital", "pwm"]),
    bp("D10", "D10 ~ SS", R, ["digital", "pwm", "cs"]),
    bp("D11", "D11 ~ MOSI", R, ["digital", "pwm", "mosi"]),
    bp("D12", "D12 MISO", R, ["digital", "miso"]),
    bp("D13", "D13 SCK", R, ["digital", "sck", "led"], { note: "Built-in LED L" }),
    gnd("GND3", R),
    { ...vout("5V_ICSP", "5V ICSP", 5, R), note: "5 V on the ICSP header, beside the digital pins" },
  ],
};

const MEGA: Pinout = {
  partId: "arduino-mega",
  controller: true,
  logic: 5,
  tolerates5V: true,
  pins: [
    vout("VIN", "VIN", 5),
    vout("5V", "5V", 5),
    vout("3V3", "3.3V", 3.3),
    gnd("GND1"),
    gnd("GND2"),
    ...Array.from({ length: 8 }, (_, i) => bp(`A${i}`, `A${i}`, L, ["analog", "digital"])),
    ...Array.from({ length: 12 }, (_, i) => {
      const n = i + 2;
      return bp(`D${n}`, `D${n} ~`, R, ["digital", "pwm", ...(n === 13 ? (["led"] as PinFn[]) : [])], n === 13 ? { note: "Built-in LED L" } : {});
    }),
    bp("D18", "D18 TX1", R, ["digital", "tx"]),
    bp("D19", "D19 RX1", R, ["digital", "rx"]),
    bp("D20", "D20 SDA", R, ["digital", "sda"]),
    bp("D21", "D21 SCL", R, ["digital", "scl"]),
    ...[22, 23, 24, 25].map((n) => bp(`D${n}`, `D${n}`, R, ["digital"])),
    bp("D50", "D50 MISO", R, ["digital", "miso"]),
    bp("D51", "D51 MOSI", R, ["digital", "mosi"]),
    bp("D52", "D52 SCK", R, ["digital", "sck"]),
    bp("D53", "D53 SS", R, ["digital", "cs"]),
    gnd("GND3", R),
    { ...vout("5V_ICSP", "5V ICSP", 5, R), note: "5 V on the ICSP header" },
  ],
};

const ESP32: Pinout = {
  partId: "esp32",
  controller: true,
  logic: 3.3,
  tolerates5V: false,
  pins: [
    vout("VIN", "VIN", 5),
    gnd("GND1"),
    bp("D36", "GPIO36 VP", L, ["analog", "digital"], { inputOnly: true, note: "Input only" }),
    bp("D39", "GPIO39 VN", L, ["analog", "digital"], { inputOnly: true, note: "Input only" }),
    bp("D34", "GPIO34", L, ["analog", "digital"], { inputOnly: true, note: "Input only" }),
    bp("D35", "GPIO35", L, ["analog", "digital"], { inputOnly: true, note: "Input only" }),
    bp("D32", "GPIO32", L, ["analog", "digital", "pwm"]),
    bp("D33", "GPIO33", L, ["analog", "digital", "pwm"]),
    bp("D25", "GPIO25", L, ["analog", "digital", "pwm"]),
    bp("D26", "GPIO26", L, ["analog", "digital", "pwm"]),
    bp("D27", "GPIO27", L, ["analog", "digital", "pwm"]),
    bp("D14", "GPIO14", L, ["analog", "digital", "pwm"]),
    bp("D12", "GPIO12", L, ["analog", "digital", "pwm"]),
    bp("D13", "GPIO13", L, ["analog", "digital", "pwm"]),
    vout("3V3", "3V3", 3.3, R),
    gnd("GND2", R),
    bp("D23", "GPIO23 MOSI", R, ["digital", "pwm", "mosi"]),
    bp("D22", "GPIO22 SCL", R, ["digital", "pwm", "scl"]),
    bp("TX", "TX0", R, ["digital", "tx"]),
    bp("RX", "RX0", R, ["digital", "rx"]),
    bp("D21", "GPIO21 SDA", R, ["digital", "pwm", "sda"]),
    bp("D19", "GPIO19 MISO", R, ["digital", "pwm", "miso"]),
    bp("D18", "GPIO18 SCK", R, ["digital", "pwm", "sck"]),
    bp("D5", "GPIO5 CS", R, ["digital", "pwm", "cs"]),
    bp("D17", "GPIO17 TX2", R, ["digital", "pwm", "tx"]),
    bp("D16", "GPIO16 RX2", R, ["digital", "pwm", "rx"]),
    bp("D4", "GPIO4", R, ["analog", "digital", "pwm"]),
    bp("D2", "GPIO2", R, ["analog", "digital", "pwm", "led"], { note: "Built-in blue LED" }),
    bp("D15", "GPIO15", R, ["analog", "digital", "pwm"]),
  ],
};

const PICO: Pinout = {
  partId: "raspberry-pi-pico",
  controller: true,
  logic: 3.3,
  tolerates5V: false,
  pins: [
    vout("VBUS", "VBUS", 5),
    vout("VSYS", "VSYS", 5),
    vout("3V3", "3V3 OUT", 3.3),
    gnd("GND1"),
    bp("GP0", "GP0 TX", L, ["digital", "pwm", "tx"]),
    bp("GP1", "GP1 RX", L, ["digital", "pwm", "rx"]),
    bp("GP2", "GP2", L, ["digital", "pwm"]),
    bp("GP3", "GP3", L, ["digital", "pwm"]),
    bp("GP4", "GP4 SDA", L, ["digital", "pwm", "sda"]),
    bp("GP5", "GP5 SCL", L, ["digital", "pwm", "scl"]),
    bp("GP6", "GP6", L, ["digital", "pwm"]),
    bp("GP7", "GP7", L, ["digital", "pwm"]),
    bp("GP8", "GP8", L, ["digital", "pwm"]),
    bp("GP9", "GP9", L, ["digital", "pwm"]),
    bp("GP10", "GP10", L, ["digital", "pwm"]),
    bp("GP11", "GP11", L, ["digital", "pwm"]),
    gnd("GND2", R),
    bp("GP28", "GP28 ADC2", R, ["analog", "digital", "pwm"]),
    bp("GP27", "GP27 ADC1", R, ["analog", "digital", "pwm"]),
    bp("GP26", "GP26 ADC0", R, ["analog", "digital", "pwm"]),
    bp("GP22", "GP22", R, ["digital", "pwm"]),
    bp("GP21", "GP21", R, ["digital", "pwm"]),
    bp("GP20", "GP20", R, ["digital", "pwm"]),
    bp("GP19", "GP19 MOSI", R, ["digital", "pwm", "mosi"]),
    bp("GP18", "GP18 SCK", R, ["digital", "pwm", "sck"]),
    bp("GP17", "GP17 CS", R, ["digital", "pwm", "cs"]),
    bp("GP16", "GP16 MISO", R, ["digital", "pwm", "miso"]),
    bp("GP15", "GP15", R, ["digital", "pwm"]),
    bp("GP14", "GP14", R, ["digital", "pwm"]),
    bp("GP13", "GP13", R, ["digital", "pwm"]),
    bp("GP12", "GP12", R, ["digital", "pwm"]),
  ],
};

const ESP8266: Pinout = {
  partId: "esp8266",
  controller: true,
  logic: 3.3,
  tolerates5V: false,
  pins: [
    vout("VIN", "VIN", 5),
    vout("3V3", "3V3", 3.3),
    gnd("GND1"),
    bp("A0", "A0", L, ["analog"], { inputOnly: true, note: "Analog in, 0–3.3 V" }),
    bp("RX", "RX", L, ["digital", "rx"]),
    bp("TX", "TX", L, ["digital", "tx"]),
    gnd("GND2", R),
    bp("D0", "D0", R, ["digital"]),
    bp("D1", "D1 SCL", R, ["digital", "pwm", "scl"]),
    bp("D2", "D2 SDA", R, ["digital", "pwm", "sda"]),
    bp("D3", "D3", R, ["digital", "pwm"]),
    bp("D4", "D4 LED", R, ["digital", "pwm", "led"], { note: "Built-in LED, active low" }),
    bp("D5", "D5 SCK", R, ["digital", "pwm", "sck"]),
    bp("D6", "D6 MISO", R, ["digital", "pwm", "miso"]),
    bp("D7", "D7 MOSI", R, ["digital", "pwm", "mosi"]),
    bp("D8", "D8 CS", R, ["digital", "pwm", "cs"]),
  ],
};

const STM32: Pinout = {
  partId: "stm32",
  controller: true,
  logic: 3.3,
  tolerates5V: "some",
  pins: [
    vout("5V", "5V", 5),
    vout("3V3", "3.3", 3.3),
    gnd("GND1", L, "G"),
    ...["PA0", "PA1", "PA2", "PA3"].map((id) => bp(id, id, L, ["analog", "digital", "pwm"])),
    bp("PA4", "PA4 CS", L, ["analog", "digital", "cs"]),
    bp("PA5", "PA5 SCK", L, ["analog", "digital", "sck"]),
    bp("PA6", "PA6 MISO", L, ["analog", "digital", "pwm", "miso"]),
    bp("PA7", "PA7 MOSI", L, ["analog", "digital", "pwm", "mosi"]),
    bp("PB0", "PB0", L, ["analog", "digital", "pwm"]),
    bp("PB1", "PB1", L, ["analog", "digital", "pwm"]),
    bp("PB10", "PB10", L, ["digital"]),
    bp("PB11", "PB11", L, ["digital"]),
    gnd("GND2", R, "G"),
    bp("PC13", "PC13 LED", R, ["digital", "led"], { note: "Built-in LED, active low" }),
    bp("PB6", "PB6 SCL", R, ["digital", "pwm", "scl"]),
    bp("PB7", "PB7 SDA", R, ["digital", "pwm", "sda"]),
    bp("PB8", "PB8", R, ["digital", "pwm"]),
    bp("PB9", "PB9", R, ["digital", "pwm"]),
    bp("PA8", "PA8", R, ["digital", "pwm"]),
    bp("PA9", "PA9 TX", R, ["digital", "pwm", "tx"]),
    bp("PA10", "PA10 RX", R, ["digital", "pwm", "rx"]),
    bp("PA15", "PA15", R, ["digital"]),
    bp("PB12", "PB12", R, ["digital"]),
    bp("PB13", "PB13", R, ["digital"]),
    bp("PB14", "PB14", R, ["digital"]),
    bp("PB15", "PB15", R, ["digital"]),
  ],
};

const PI4: Pinout = {
  partId: "raspberry-pi-4",
  controller: true,
  logic: 3.3,
  tolerates5V: false,
  pins: [
    vout("3V3", "3V3", 3.3),
    vout("5V", "5V", 5),
    gnd("GND1"),
    bp("GPIO2", "GPIO2 SDA", L, ["digital", "sda"]),
    bp("GPIO3", "GPIO3 SCL", L, ["digital", "scl"]),
    bp("GPIO4", "GPIO4", L, ["digital"]),
    bp("GPIO17", "GPIO17", L, ["digital"]),
    bp("GPIO27", "GPIO27", L, ["digital"]),
    bp("GPIO22", "GPIO22", L, ["digital"]),
    bp("GPIO10", "GPIO10 MOSI", L, ["digital", "mosi"]),
    bp("GPIO9", "GPIO9 MISO", L, ["digital", "miso"]),
    bp("GPIO11", "GPIO11 SCLK", L, ["digital", "sck"]),
    bp("GPIO5", "GPIO5", L, ["digital"]),
    bp("GPIO6", "GPIO6", L, ["digital"]),
    bp("GPIO13", "GPIO13 PWM1", L, ["digital", "pwm"]),
    bp("GPIO19", "GPIO19 PWM1", L, ["digital", "pwm"]),
    bp("GPIO26", "GPIO26", L, ["digital"]),
    gnd("GND2", R),
    bp("GPIO14", "GPIO14 TXD", R, ["digital", "tx"]),
    bp("GPIO15", "GPIO15 RXD", R, ["digital", "rx"]),
    bp("GPIO18", "GPIO18 PWM0", R, ["digital", "pwm"]),
    bp("GPIO23", "GPIO23", R, ["digital"]),
    bp("GPIO24", "GPIO24", R, ["digital"]),
    bp("GPIO25", "GPIO25", R, ["digital"]),
    bp("GPIO8", "GPIO8 CE0", R, ["digital", "cs"]),
    bp("GPIO7", "GPIO7 CE1", R, ["digital", "cs"]),
    bp("GPIO12", "GPIO12 PWM0", R, ["digital", "pwm"]),
    bp("GPIO16", "GPIO16", R, ["digital"]),
    bp("GPIO20", "GPIO20", R, ["digital"]),
    bp("GPIO21", "GPIO21", R, ["digital"]),
  ],
};

const MICROBIT: Pinout = {
  partId: "microbit",
  controller: true,
  logic: 3.3,
  tolerates5V: false,
  pins: [
    vout("3V", "3V", 3.3),
    gnd("GND1"),
    bp("P0", "P0", L, ["analog", "digital", "pwm"]),
    bp("P1", "P1", L, ["analog", "digital", "pwm"]),
    bp("P2", "P2", L, ["analog", "digital", "pwm"]),
    gnd("GND2", R),
    bp("P8", "P8", R, ["digital", "pwm"]),
    bp("P12", "P12", R, ["digital", "pwm"]),
    bp("P13", "P13 SCK", R, ["digital", "sck"]),
    bp("P14", "P14 MISO", R, ["digital", "miso"]),
    bp("P15", "P15 MOSI", R, ["digital", "mosi"]),
    bp("P16", "P16", R, ["digital", "pwm", "cs"]),
    bp("P19", "P19 SCL", R, ["digital", "scl"]),
    bp("P20", "P20 SDA", R, ["digital", "sda"]),
  ],
};

const TEENSY: Pinout = {
  partId: "teensy",
  controller: true,
  logic: 3.3,
  tolerates5V: false,
  pins: [
    vout("VIN", "VIN", 5),
    vout("3V3", "3.3V", 3.3),
    gnd("GND1"),
    bp("0", "0 RX1", L, ["digital", "pwm", "rx"]),
    bp("1", "1 TX1", L, ["digital", "pwm", "tx"]),
    ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => bp(String(n), `${n} ~`, L, ["digital", "pwm"])),
    bp("10", "10 CS", L, ["digital", "pwm", "cs"]),
    bp("11", "11 MOSI", L, ["digital", "pwm", "mosi"]),
    bp("12", "12 MISO", L, ["digital", "pwm", "miso"]),
    gnd("GND2", R),
    bp("13", "13 SCK", R, ["digital", "pwm", "sck", "led"], { note: "Built-in LED" }),
    bp("14", "14 A0", R, ["analog", "digital", "pwm"]),
    bp("15", "15 A1", R, ["analog", "digital", "pwm"]),
    bp("16", "16 A2", R, ["analog", "digital"]),
    bp("17", "17 A3", R, ["analog", "digital"]),
    bp("18", "18 A4 SDA", R, ["analog", "digital", "pwm", "sda"]),
    bp("19", "19 A5 SCL", R, ["analog", "digital", "pwm", "scl"]),
    bp("20", "20 A6", R, ["analog", "digital"]),
    bp("21", "21 A7", R, ["analog", "digital"]),
    bp("22", "22 A8", R, ["analog", "digital", "pwm"]),
    bp("23", "23 A9", R, ["analog", "digital", "pwm"]),
  ],
};

// ----- peripherals -------------------------------------------------------------

function peripheral(partId: string, logic: number, supply: [number, number], pins: LabPin[], tolerates5V = logic >= 5): Pinout {
  return { partId, controller: false, logic, supply, tolerates5V, pins };
}

const PERIPHERALS: Pinout[] = [
  // Sensors
  peripheral("dht11", 5, [3, 5.5], [pp("VCC", "VCC", "vcc"), pp("DATA", "DATA", "io", true, "Single-wire data; 10 kΩ pull-up to VCC"), pp("NC", "NC", "opt", false, "Not connected"), pp("GND", "GND", "gnd")]),
  peripheral("hc-sr04", 5, [4.5, 5.5], [pp("VCC", "VCC", "vcc"), pp("TRIG", "Trig", "drive", true, "10 µs pulse starts a ping"), pp("ECHO", "Echo", "out-digital", true, "High for the echo's round trip, at 5 V"), pp("GND", "GND", "gnd")]),
  { ...peripheral("pir", 3.3, [4.5, 20], [pp("VCC", "VCC", "vcc"), pp("OUT", "OUT", "out-digital", true, "3.3 V while motion is seen"), pp("GND", "GND", "gnd")]), tolerates5V: true },
  peripheral("dht22", 5, [3.3, 6], [pp("VCC", "VCC", "vcc"), pp("DATA", "DATA", "io", true, "Single-wire data; 10 kΩ pull-up"), pp("NC", "NC", "opt", false), pp("GND", "GND", "gnd")]),
  peripheral("am2302", 5, [3.3, 5.5], [pp("VCC", "Red VCC", "vcc"), pp("DATA", "Yellow DATA", "io"), pp("GND", "Black GND", "gnd")]),
  peripheral("ldr", 5, [0, 5.5], [pp("L1", "Leg 1", "vcc", true, "To VCC"), pp("L2", "Leg 2", "out-analog", true, "To an analog pin, 10 kΩ to GND")]),
  peripheral("ds18b20", 5, [3, 5.5], [pp("GND", "GND", "gnd"), pp("DQ", "DQ", "io", true, "1-Wire data; 4.7 kΩ pull-up"), pp("VDD", "VDD", "vcc")]),
  peripheral("soil-moisture", 5, [3.3, 5], [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("D0", "D0", "out-digital", false, "Goes low past the threshold"), pp("A0", "A0", "out-analog", false, "Wetter soil, lower voltage")]),
  peripheral("mq2", 5, [4.5, 5.5], [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("D0", "D0", "out-digital", false, "Low when gas passes the threshold"), pp("A0", "A0", "out-analog", false, "More gas, higher voltage")]),
  peripheral("mpu6050", 5, [3.3, 5], [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("SCL", "SCL", "scl"), pp("SDA", "SDA", "sda"), pp("XDA", "XDA", "opt", false), pp("XCL", "XCL", "opt", false), pp("AD0", "AD0", "opt", false, "Low: 0x68, high: 0x69"), pp("INT", "INT", "opt", false, "Data-ready interrupt")]),
  peripheral("bmp280", 3.3, [1.7, 3.6], [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("SCL", "SCL", "scl"), pp("SDA", "SDA", "sda"), pp("CSB", "CSB", "opt", false), pp("SDO", "SDO", "opt", false, "Low: 0x76, high: 0x77")]),
  // Outputs
  peripheral("led", 5, [0, 5.5], [pp("A", "Anode (+)", "drive", true, "From an output pin, through 220 Ω"), pp("C", "Cathode (−)", "gnd")]),
  peripheral("rgb-led", 5, [0, 5.5], [pp("R", "R", "pwm", false, "Red, through 220 Ω to a PWM pin"), pp("GND", "GND", "gnd"), pp("G", "G", "pwm", false, "Green, through 220 Ω"), pp("B", "B", "pwm", false, "Blue, through 220 Ω")]),
  peripheral("buzzer", 5, [3.5, 5.5], [pp("P", "+", "drive", true, "From an output pin"), pp("N", "−", "gnd")]),
  peripheral("servo", 5, [4.8, 6], [pp("GND", "GND (brown)", "gnd"), pp("VCC", "VCC (red)", "vcc"), pp("SIG", "Signal (orange)", "pwm", true, "50 Hz pulse sets the angle")]),
  peripheral("dc-motor", 5, [3, 6], [pp("VM", "VM", "vcc", true, "Motor supply through the driver"), pp("GND", "GND", "gnd"), pp("IN1", "IN1", "drive", false, "Direction"), pp("IN2", "IN2", "drive", false, "Direction"), pp("EN", "EN / PWM", "pwm", false, "Speed")]),
  peripheral("relay", 5, [4.5, 5.5], [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("IN", "IN", "drive", true, "Low energises the coil"), pp("COM", "COM", "load"), pp("NO", "NO", "load"), pp("NC", "NC", "load")]),
  peripheral("stepper-motor", 5, [4.5, 5.5], [pp("IN1", "IN1", "drive"), pp("IN2", "IN2", "drive"), pp("IN3", "IN3", "drive"), pp("IN4", "IN4", "drive"), pp("VCC", "+", "vcc"), pp("GND", "−", "gnd")]),
  // Displays
  peripheral("lcd-16x2", 5, [4.5, 5.5], [pp("GND", "GND", "gnd"), pp("VCC", "VCC", "vcc"), pp("SDA", "SDA", "sda"), pp("SCL", "SCL", "scl")]),
  peripheral("oled-ssd1306", 5, [3.3, 5], [pp("GND", "GND", "gnd"), pp("VCC", "VCC", "vcc"), pp("SCL", "SCL", "scl"), pp("SDA", "SDA", "sda")]),
  peripheral("tft-display", 5, [3.3, 5], [
    pp("VCC", "VCC", "vcc"),
    pp("GND", "GND", "gnd"),
    pp("CS", "CS", "cs"),
    pp("RST", "RST", "drive", false),
    pp("DC", "A0 (DC)", "drive"),
    pp("SDA", "SDA (MOSI)", "mosi"),
    pp("SCK", "SCK", "sck"),
    pp("LED", "LED", "opt", false, "Backlight, to 3.3 V"),
  ]),
  // Radios
  peripheral("hc-05", 3.3, [3.6, 6], [pp("STATE", "STATE", "opt", false), pp("RXD", "RXD", "rx", true, "3.3 V logic: divide a 5 V TX down"), pp("TXD", "TXD", "tx"), pp("GND", "GND", "gnd"), pp("VCC", "VCC", "vcc"), pp("EN", "EN / KEY", "opt", false)]),
  peripheral("wifi-module", 3.3, [3, 3.6], [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("TX", "TX", "tx"), pp("RX", "RX", "rx"), pp("EN", "CH_PD (EN)", "opt", false, "Hold high to run"), pp("RST", "RST", "opt", false), pp("GPIO0", "GPIO0", "opt", false), pp("GPIO2", "GPIO2", "opt", false)]),
  // nRF24L01+ signal pins are 5 V tolerant; only its supply must stay at 3.3 V.
  peripheral("nrf24l01", 3.3, [1.9, 3.6], [pp("GND", "GND", "gnd"), pp("VCC", "VCC", "vcc"), pp("CE", "CE", "drive"), pp("CSN", "CSN", "cs"), pp("SCK", "SCK", "sck"), pp("MOSI", "MOSI", "mosi"), pp("MISO", "MISO", "miso"), pp("IRQ", "IRQ", "opt", false)], true),
  peripheral("lora", 3.3, [1.8, 3.7], [pp("VCC", "3.3V", "vcc"), pp("GND", "GND", "gnd"), pp("NSS", "NSS", "cs"), pp("MOSI", "MOSI", "mosi"), pp("MISO", "MISO", "miso"), pp("SCK", "SCK", "sck"), pp("RST", "RST", "opt", false), pp("DIO0", "DIO0", "opt", false, "Packet interrupt"), pp("DIO1", "DIO1", "opt", false)]),
];

// ----- prototyping -------------------------------------------------------------

function terminalNote(id: string): string {
  const col = id.slice(1);
  const [first, last] = "abcde".includes(id[0]) ? ["a", "e"] : ["f", "j"];
  return `Joined to ${first}${col}–${last}${col}: one five-hole strip`;
}

/** Every hole is a pin; the strips say which holes share a clip. */
function breadboardPinout(spec: BreadboardSpec): Pinout {
  const middle = spec.size.h / 2;
  return {
    partId: spec.partId,
    controller: false,
    passive: true,
    logic: 5,
    tolerates5V: true,
    pins: spec.holes.map((h): LabPin => {
      const rail = h.rail ? spec.rails[h.rail] : undefined;
      return {
        id: h.id,
        label: h.label,
        side: h.y < middle ? L : R,
        fns: rail ? [rail.sign === "+" ? "power" : "ground"] : undefined,
        role: rail ? undefined : "opt",
        note: rail ? `${rail.label} rail: all ${spec.railHoles} holes are joined` : terminalNote(h.id),
      };
    }),
    strips: spec.strips,
  };
}

const BREADBOARDS: Pinout[] = Object.values(BREADBOARD_SPECS).map(breadboardPinout);

/** A resistor: two legs, no polarity. It joins nothing inside; the analysis follows current through it. */
const RESISTOR: Pinout = {
  partId: "resistor",
  controller: false,
  passive: true,
  logic: 5,
  tolerates5V: true,
  pins: [
    { id: "1", label: "Leg 1", side: L, role: "opt", note: "Either way round" },
    { id: "2", label: "Leg 2", side: R, role: "opt", note: "Either way round" },
  ],
};

const ALL: Pinout[] = [UNO, ESP32, PICO, MEGA, ESP8266, STM32, PI4, MICROBIT, TEENSY, ...BREADBOARDS, RESISTOR, ...PERIPHERALS];

const BY_ID = new Map(ALL.map((p) => [p.partId, p]));

export const PINOUTS: readonly Pinout[] = ALL;

const GENERIC: Pinout = {
  partId: "generic",
  controller: false,
  logic: 3.3,
  tolerates5V: false,
  supply: [3, 5.5],
  pins: [pp("VCC", "VCC", "vcc"), pp("GND", "GND", "gnd"), pp("SIG", "Signal", "io", false)],
};

export function getPinout(partId: string): Pinout {
  return BY_ID.get(partId) ?? { ...GENERIC, partId };
}

export function hasPinout(partId: string): boolean {
  return BY_ID.has(partId);
}

export function getPin(partId: string, pinId: string): LabPin | undefined {
  return getPinout(partId).pins.find((p) => p.id === pinId);
}

/** The color family a pin belongs to, for its dot on the canvas. */
export type PinTone = "power" | "ground" | "analog" | "pwm" | "bus" | "digital" | "muted";

export function pinTone(pin: LabPin): PinTone {
  const fns = pin.fns ?? [];
  const role = pin.role;
  if (fns.includes("power") || role === "vcc") return "power";
  if (fns.includes("ground") || role === "gnd") return "ground";
  if (role === "opt" || role === "load") return "muted";
  if (role === "out-analog") return "analog";
  if (role === "pwm") return "pwm";
  if (role && ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"].includes(role)) return "bus";
  if (fns.some((f) => ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"].includes(f))) return "bus";
  if (fns.includes("pwm")) return "pwm";
  if (fns.includes("analog") && !fns.includes("pwm")) return "analog";
  return "digital";
}
