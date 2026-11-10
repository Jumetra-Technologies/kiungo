/**
 * Parts that answer the emulated board the way the real ones do (EMU-02):
 * an HC-SR04 replies to a trigger pulse with an echo as long as the sound's
 * round trip, a DHT11 or DHT22 answers its start signal with 40 timed bits,
 * analog sensors set a voltage on their ADC channel, and digital ones hold a
 * level. Libraries and sketches written for the real parts (pulseIn, the DHT
 * library) work unchanged, because the timing is the real timing, in clock
 * cycles.
 */

import type { AvrBoard, PinChange } from "./avr";

export type PeripheralInput =
  | { kind: "digital"; id: string; pin: number; high: boolean }
  | { kind: "analog"; id: string; pin: number; volts: number }
  | { kind: "hc-sr04"; id: string; trig: number; echo: number; distanceCm: number }
  | { kind: "dht"; id: string; pin: number; model: 11 | 22; temperatureC: number; humidity: number };

/** Microseconds of echo per centimeter: there and back at 343 m/s. */
export const ECHO_US_PER_CM = 2 / 0.0343;
/** The HC-SR04's range; outside it the echo times out after 38 ms. */
export const HC_SR04_RANGE_CM = { min: 2, max: 400 };
const HC_SR04_TIMEOUT_US = 38_000;
/** From the end of the trigger to the start of the echo: the 40 kHz burst goes out first. */
const HC_SR04_BURST_US = 250;

/** The analog channel of an Arduino pin number on the ATmega328P (A0 is 14). */
export const analogChannel = (pin: number) => pin - 14;

interface Model {
  update(input: PeripheralInput): void;
  onPin(change: PinChange): void;
}

class Digital implements Model {
  constructor(private readonly board: AvrBoard, private input: Extract<PeripheralInput, { kind: "digital" }>) {
    board.setInput(input.pin, input.high);
  }
  update(input: PeripheralInput) {
    if (input.kind !== "digital") return;
    this.input = input;
    this.board.setInput(input.pin, input.high);
  }
  onPin() {}
}

class Analog implements Model {
  constructor(private readonly board: AvrBoard, input: Extract<PeripheralInput, { kind: "analog" }>) {
    this.update(input);
  }
  update(input: PeripheralInput) {
    if (input.kind === "analog") this.board.setAnalog(analogChannel(input.pin), input.volts);
  }
  onPin() {}
}

export class HcSr04 implements Model {
  private riseAt: number | null = null;
  private busy = false;
  /** Pulses it has answered, for tests. */
  echoes = 0;

  constructor(private readonly board: AvrBoard, private input: Extract<PeripheralInput, { kind: "hc-sr04" }>) {
    board.setInput(input.echo, false);
  }
  update(input: PeripheralInput) {
    if (input.kind === "hc-sr04") this.input = input;
  }
  onPin(change: PinChange) {
    if (change.pin !== this.input.trig) return;
    if (change.level === "high") {
      this.riseAt = change.cycle;
      return;
    }
    if (this.riseAt === null || this.busy) return;
    const width = change.cycle - this.riseAt;
    this.riseAt = null;
    // The module needs a trigger of at least 10 µs.
    if (width < this.board.usToCycles(10)) return;
    const d = this.input.distanceCm;
    const echoUs = d < HC_SR04_RANGE_CM.min || d > HC_SR04_RANGE_CM.max ? HC_SR04_TIMEOUT_US : d * ECHO_US_PER_CM;
    this.busy = true;
    const echo = this.input.echo;
    this.board.schedule(this.board.usToCycles(HC_SR04_BURST_US), () => {
      this.board.setInput(echo, true);
      this.board.schedule(this.board.usToCycles(echoUs), () => {
        this.board.setInput(echo, false);
        this.busy = false;
        this.echoes++;
      });
    });
  }
}

/** The 5 bytes a DHT sends: humidity, temperature, checksum. */
export function dhtBytes(model: 11 | 22, temperatureC: number, humidity: number): number[] {
  const h = Math.max(0, Math.min(100, humidity));
  let bytes: number[];
  if (model === 11) {
    const t = Math.max(-20, Math.min(60, temperatureC));
    const whole = Math.trunc(Math.abs(t));
    const tenths = Math.round((Math.abs(t) - whole) * 10) % 10;
    bytes = [Math.round(h), 0, whole, (t < 0 ? 0x80 : 0) | tenths];
  } else {
    const hx = Math.round(h * 10);
    const tx = Math.round(Math.abs(Math.max(-40, Math.min(80, temperatureC))) * 10);
    bytes = [hx >> 8, hx & 0xff, ((tx >> 8) & 0x7f) | (temperatureC < 0 ? 0x80 : 0), tx & 0xff];
  }
  return [...bytes, bytes.reduce((a, b) => a + b, 0) & 0xff];
}

export class Dht implements Model {
  private lowSince: number | null = null;
  private busy = false;
  reads = 0;

  constructor(private readonly board: AvrBoard, private input: Extract<PeripheralInput, { kind: "dht" }>) {
    // The data line has a pull-up: high when nobody drives it.
    board.setInput(input.pin, true);
  }
  update(input: PeripheralInput) {
    if (input.kind === "dht") this.input = input;
  }
  onPin(change: PinChange) {
    if (change.pin !== this.input.pin || this.busy) return;
    if (change.level === "low") {
      this.lowSince = change.cycle;
      return;
    }
    if (this.lowSince === null) return;
    const held = change.cycle - this.lowSince;
    this.lowSince = null;
    // The start signal: at least 1 ms low (DHT22), 18 ms for the DHT11; then the MCU lets go.
    if (change.level === "high" || held < this.board.usToCycles(this.input.model === 11 ? 18_000 : 800)) return;
    this.respond();
  }

  private respond() {
    this.busy = true;
    const pin = this.input.pin;
    // [level, µs]: low 80 and high 80 to say "here it comes", then each bit as 50 µs low and a
    // high of 26 µs (0) or 70 µs (1), most significant first, then 50 µs low before letting go.
    const segments: Array<[boolean, number]> = [
      [false, 80],
      [true, 80],
    ];
    for (const byte of dhtBytes(this.input.model, this.input.temperatureC, this.input.humidity)) {
      for (let bit = 7; bit >= 0; bit--) segments.push([false, 50], [true, (byte >> bit) & 1 ? 70 : 26]);
    }
    segments.push([false, 50]);
    let i = 0;
    const step = () => {
      const segment = segments[i++];
      if (!segment) {
        this.board.setInput(pin, true);
        this.busy = false;
        this.reads++;
        return;
      }
      this.board.setInput(pin, segment[0]);
      this.board.schedule(this.board.usToCycles(segment[1]), step);
    };
    // The sensor answers about 30 µs after the line is released.
    this.board.schedule(this.board.usToCycles(30), step);
  }
}

/** The parts wired to one emulated board, kept in step with the lab's inputs. */
export class Peripherals {
  private readonly models = new Map<string, { kind: PeripheralInput["kind"]; model: Model }>();

  constructor(private readonly board: AvrBoard) {
    board.onPinChange((change) => {
      for (const { model } of this.models.values()) model.onPin(change);
    });
  }

  /** Make, update or drop models to match the parts wired now. */
  apply(inputs: readonly PeripheralInput[]): void {
    const seen = new Set<string>();
    for (const input of inputs) {
      seen.add(input.id);
      const existing = this.models.get(input.id);
      if (existing && existing.kind === input.kind) {
        existing.model.update(input);
        continue;
      }
      this.models.set(input.id, { kind: input.kind, model: this.make(input) });
    }
    for (const id of [...this.models.keys()]) if (!seen.has(id)) this.models.delete(id);
  }

  get(id: string): Model | undefined {
    return this.models.get(id)?.model;
  }

  private make(input: PeripheralInput): Model {
    switch (input.kind) {
      case "digital":
        return new Digital(this.board, input);
      case "analog":
        return new Analog(this.board, input);
      case "hc-sr04":
        return new HcSr04(this.board, input);
      case "dht":
        return new Dht(this.board, input);
    }
  }
}
