/**
 * An emulated ATmega328P (Uno, Nano) running the user's compiled program (EMU-01).
 *
 * The chip has exactly the board's flash and SRAM (HWT-01): a program that
 * doesn't fit is refused, and nothing can enlarge memory. Time is counted in
 * clock cycles only; this file never reads a wall clock, so the same program
 * with the same inputs always runs the same way (EMU-04).
 */
import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from "avr8js";
import type { BoardDefinition, BoardPin } from "../boards";
import { maxSketchBytes } from "../boards";
import { parseIntelHex } from "../firmware/intel-hex";

export type PinLevel = "high" | "low" | "input" | "pullup";

export interface PinChange {
  /** The Arduino pin number (13 for D13, 14 for A0). */
  pin: number;
  level: PinLevel;
  /** The CPU cycle the change happened on. */
  cycle: number;
}

function levelOf(state: PinState): PinLevel {
  switch (state) {
    case PinState.High:
      return "high";
    case PinState.Low:
      return "low";
    case PinState.InputPullUp:
      return "pullup";
    default:
      return "input";
  }
}

/**
 * Why the emulated chip stopped running the program, as a real one would stop:
 * the stack ran out of RAM and over the chip's registers, or the program
 * jumped outside itself (both what an out-of-memory crash looks like).
 */
export type CrashKind = "stack" | "lost";

export class AvrBoard {
  readonly board: BoardDefinition;
  /** Size of the loaded program, in bytes of flash. */
  readonly programBytes: number;
  private readonly cpu: CPU;
  private readonly ports: Record<BoardPin["port"], AVRIOPort>;
  private readonly levels = new Map<number, PinLevel>();
  private pinListeners: Array<(change: PinChange) => void> = [];
  private serialListeners: Array<(byte: number) => void> = [];
  private readonly usart: AVRUSART;
  private readonly adc: AVRADC;
  private rxQueue: number[] = [];
  private readonly flashWords: number;
  private readonly ramEnd: number;
  /** Set once the program has crashed; the chip runs nothing after that, as a hung board doesn't. */
  crashed: CrashKind | null = null;

  /**
   * @param program The compiled program as Intel HEX text (what Arduino CLI
   *   writes as `sketch.ino.hex`) or as the raw flash image.
   */
  constructor(board: BoardDefinition, program: string | Uint8Array) {
    if (board.mcu !== "atmega328p") throw new Error(`${board.name} isn't emulated yet.`);
    this.board = board;
    const image =
      typeof program === "string" ? parseIntelHex(program, maxSketchBytes(board)) : program;
    if (image.length > maxSketchBytes(board)) {
      throw new Error(
        `The program is ${image.length.toLocaleString("en-US")} bytes, more than the ${maxSketchBytes(board).toLocaleString("en-US")} the ${board.name} has room for.`,
      );
    }
    this.programBytes = image.length;
    const flash = new Uint16Array(board.flashBytes / 2);
    new Uint8Array(flash.buffer).set(image);
    this.cpu = new CPU(flash, board.sramBytes);
    this.flashWords = flash.length;
    // SRAM sits after the 32 registers and 224 I/O addresses.
    this.ramEnd = 0x100 + board.sramBytes - 1;

    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    const usart = new AVRUSART(this.cpu, usart0Config, board.clockHz);
    usart.onByteTransmit = (byte) => this.serialListeners.forEach((l) => l(byte));
    usart.onRxComplete = () => this.pumpRx();
    this.usart = usart;

    this.adc = new AVRADC(this.cpu, adcConfig);
    this.adc.avcc = 5;
    // An unconnected analog pin floats; a real one reads somewhere in the middle, not a clean zero.
    for (let ch = 0; ch < 8; ch++) this.adc.channelValues[ch] = 2.5;

    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    for (const pin of board.pins) this.levels.set(pin.arduino, "input");
    for (const name of ["B", "C", "D"] as const) {
      this.ports[name].addListener(() => this.onPortChange(name));
    }
  }

  private onPortChange(port: BoardPin["port"]) {
    for (const pin of this.board.pins) {
      if (pin.port !== port) continue;
      const level = levelOf(this.ports[port].pinState(pin.bit));
      if (this.levels.get(pin.arduino) === level) continue;
      this.levels.set(pin.arduino, level);
      const change: PinChange = { pin: pin.arduino, level, cycle: this.cpu.cycles };
      this.pinListeners.forEach((l) => l(change));
    }
  }

  /** The program counter, in words: 0 after a reset (or a crash that jumps there). */
  get pc(): number {
    return this.cpu.pc;
  }

  /** The stack pointer: it grows down from the top of SRAM toward the program's variables. */
  get sp(): number {
    return this.cpu.SP;
  }

  /** Call `fn` after this many clock cycles of simulated time (for a sensor's timed reply). */
  schedule(cycles: number, fn: () => void): void {
    this.cpu.addClockEvent(fn, Math.max(1, Math.round(cycles)));
  }

  /** Clock cycles in a number of microseconds. */
  usToCycles(us: number): number {
    return (us / 1_000_000) * this.board.clockHz;
  }

  /** Set the voltage on an analog input (A0 is channel 0). */
  setAnalog(channel: number, volts: number): void {
    if (channel < 0 || channel > 7) throw new Error(`There's no analog channel ${channel}.`);
    this.adc.channelValues[channel] = Math.max(0, Math.min(this.adc.avcc, volts));
  }

  /** Clock cycles run since reset. */
  get cycles(): number {
    return this.cpu.cycles;
  }

  /** Simulated time since reset, in milliseconds. */
  get timeMs(): number {
    return (this.cpu.cycles / this.board.clockHz) * 1000;
  }

  /** Run the CPU for a number of clock cycles. */
  runCycles(cycles: number): void {
    if (this.crashed) return;
    const cpu = this.cpu;
    const end = cpu.cycles + cycles;
    const words = this.flashWords;
    while (cpu.cycles < end) {
      avrInstruction(cpu);
      cpu.tick();
      if (this.rxQueue.length && this.usart.rxBusy === false) this.pumpRx();
      if (!(cpu.pc < words)) {
        this.crashed = "lost";
        return;
      }
    }
    const sp = cpu.SP;
    if (sp < 0x100 || sp > this.ramEnd) this.crashed = "stack";
  }

  /**
   * Send bytes to the board's UART, as the PC would over USB. They arrive at
   * the UART's own baud rate as the CPU runs, so call runMs() afterwards.
   */
  writeSerial(bytes: Uint8Array | number[]): void {
    for (const b of bytes) this.rxQueue.push(b & 0xff);
    this.pumpRx();
  }

  private pumpRx(): void {
    if (!this.rxQueue.length || this.usart.rxBusy) return;
    // Before the sketch's Serial.begin() the UART isn't listening and the byte is lost, as on a real board.
    this.usart.writeByte(this.rxQueue.shift()!);
  }

  /** Run the CPU for a stretch of simulated time. */
  runMs(ms: number): void {
    this.runCycles(Math.round((ms / 1000) * this.board.clockHz));
  }

  level(pin: number): PinLevel {
    return this.levels.get(pin) ?? "input";
  }

  /** Drive an input pin from outside (a button, a sensor's digital output). */
  setInput(pin: number, high: boolean): void {
    const def = this.board.pins.find((p) => p.arduino === pin);
    if (!def) throw new Error(`${this.board.name} has no pin ${pin}.`);
    this.ports[def.port].setPin(def.bit, high);
  }

  onPinChange(listener: (change: PinChange) => void): () => void {
    this.pinListeners.push(listener);
    return () => (this.pinListeners = this.pinListeners.filter((l) => l !== listener));
  }

  onSerialByte(listener: (byte: number) => void): () => void {
    this.serialListeners.push(listener);
    return () => (this.serialListeners = this.serialListeners.filter((l) => l !== listener));
  }
}
