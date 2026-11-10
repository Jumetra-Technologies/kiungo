export type PinFn =
  | "power"
  | "ground"
  | "digital"
  | "analog"
  | "pwm"
  | "sda"
  | "scl"
  | "tx"
  | "rx"
  | "mosi"
  | "miso"
  | "sck"
  | "cs"
  | "led";

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
  | "opt";

// optional

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

/** The color family a pin belongs to, for its dot on the canvas. */
export type PinTone = "power" | "ground" | "analog" | "pwm" | "bus" | "digital" | "muted";
