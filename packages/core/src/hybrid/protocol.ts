/**
 * The Hybrid link's frames (INJ-03 push model, INJ-04 framed channel).
 *
 * Every frame is `type, payload...`, COBS-encoded, ending in 0x00. The link
 * runs at 115200 regardless of the sketch's Serial.begin(), and the sketch's
 * own Serial text travels inside TEXT frames, so the PC can tell it from
 * Kiungo's frames.
 *
 * The board's side is apps/desktop/resources/hybrid/KiungoHybrid/src/kiungo_hybrid.cpp.
 */

import { CobsStream, cobsEncode } from "./cobs";

export const LINK_BAUD = 115200;
export const PROTOCOL_VERSION = 2;
export const MAX_SENSORS = 8;

export const Frame = {
  // PC -> board
  Hello: 0x01,
  Set: 0x02,
  In: 0x03,
  Ping: 0x04,
  Stop: 0x05,
  // board -> PC
  HelloAck: 0x81,
  Text: 0x82,
  Ack: 0x83,
  Stats: 0x84,
  Out: 0x85,
  Safe: 0x86,
} as const;

/** Why the board's outputs are held safe (SAF-01, SAF-02). */
export type SafeReason = "stop" | "emergency" | "link-lost";
const SAFE_CODES: Record<SafeReason, number> = { stop: 1, emergency: 2, "link-lost": 3 };

export type BoardFrame =
  | { type: "hello"; protocol: number; sensors: number }
  | { type: "text"; bytes: Uint8Array }
  | { type: "ack"; seq: number }
  | { type: "stats"; framesIn: number; bad: number; dropped: number }
  /** What the sketch drove: each pin's level (pins 0 to 19 as bits), and the PWM value of pins it analogWrites. */
  /** What the sketch drove: levels as bits (bit n is pin n), which pins it has written, and PWM duty 0-255. */
  | { type: "out"; levels: number; driven: number; pwm: Array<[pin: number, value: number]> }
  /** The outputs went to the safe state, or are still in it (sent with each PING's answer). */
  | { type: "safe"; reason: SafeReason }
  | { type: "unknown"; code: number; payload: Uint8Array };

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

/** Push a sensor value. Values are signed 32-bit; the adapter decides the unit (cm for an HC-SR04). */
export function encodeSet(sensor: number, value: number): Uint8Array {
  if (!Number.isInteger(sensor) || sensor < 0 || sensor >= MAX_SENSORS) throw new Error(`Sensor id ${sensor} is out of range (0 to ${MAX_SENSORS - 1}).`);
  const v = Math.trunc(value);
  if (v < -2147483648 || v > 2147483647) throw new Error(`Value ${value} doesn't fit in 32 bits.`);
  const raw = new Uint8Array(6);
  raw[0] = Frame.Set;
  raw[1] = sensor;
  new DataView(raw.buffer).setInt32(2, v, true);
  return cobsEncode(raw);
}

export function encodeHello(): Uint8Array {
  return cobsEncode(Uint8Array.of(Frame.Hello));
}

/** Every driven pin low, and held there: Stop or the emergency stop (SAF-01). */
export function encodeStop(reason: "stop" | "emergency"): Uint8Array {
  return cobsEncode(Uint8Array.of(Frame.Stop, SAFE_CODES[reason]));
}

export function encodePing(seq: number): Uint8Array {
  return cobsEncode(Uint8Array.of(Frame.Ping, seq & 0xff));
}

/** Bytes for the sketch's Serial.read(). At most 62 per frame. */
export function encodeIn(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += 62) {
    const chunk = bytes.subarray(at, at + 62);
    const raw = new Uint8Array(chunk.length + 1);
    raw[0] = Frame.In;
    raw.set(chunk, 1);
    frames.push(cobsEncode(raw));
  }
  return frames;
}

export function decodeFrame(raw: Uint8Array): BoardFrame {
  const code = raw[0];
  const payload = raw.subarray(1);
  switch (code) {
    case Frame.HelloAck:
      return { type: "hello", protocol: payload[0] ?? 0, sensors: payload[1] ?? 0 };
    case Frame.Text:
      return { type: "text", bytes: payload };
    case Frame.Ack:
      return { type: "ack", seq: payload[0] ?? 0 };
    case Frame.Stats:
      return { type: "stats", framesIn: u16(payload, 0), bad: u16(payload, 2), dropped: u16(payload, 4) };
    case Frame.Out: {
      const u32 = (o: number) => ((payload[o] ?? 0) | ((payload[o + 1] ?? 0) << 8) | ((payload[o + 2] ?? 0) << 16) | ((payload[o + 3] ?? 0) << 24)) >>> 0;
      const pwm: Array<[number, number]> = [];
      for (let i = 8; i + 1 < payload.length; i += 2) pwm.push([payload[i], payload[i + 1]]);
      return { type: "out", levels: u32(0), driven: u32(4), pwm };
    }
    case Frame.Safe: {
      const reason = (Object.keys(SAFE_CODES) as SafeReason[]).find((k) => SAFE_CODES[k] === payload[0]);
      return reason ? { type: "safe", reason } : { type: "unknown", code, payload };
    }
    default:
      return { type: "unknown", code, payload };
  }
}

/** Turns the bytes the board sends into frames, and collects the sketch's text. */
export class LinkReader {
  private readonly stream = new CobsStream();
  private readonly decoder = new TextDecoder();
  private pending = "";

  get badFrames(): number {
    return this.stream.bad;
  }

  feed(bytes: Uint8Array): BoardFrame[] {
    return this.stream.feed(bytes).map(decodeFrame);
  }

  /**
   * Feed bytes and return the complete lines of the sketch's Serial output
   * (without their line endings). A partial last line waits for the rest.
   */
  feedLines(bytes: Uint8Array): { frames: BoardFrame[]; lines: string[] } {
    const frames = this.feed(bytes);
    for (const frame of frames) {
      if (frame.type === "text") this.pending += this.decoder.decode(frame.bytes, { stream: true });
    }
    const parts = this.pending.split("\n");
    this.pending = parts.pop() ?? "";
    return { frames, lines: parts.map((line) => line.replace(/\r$/, "")) };
  }
}
