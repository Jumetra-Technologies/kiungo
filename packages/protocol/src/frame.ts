import { CobsError, cobsDecode, cobsEncode } from "./cobs";
import { crc16 } from "./crc";

/**
 * INJ-04 wire format. Before COBS encoding a frame is:
 *   start byte | type | channel | length | payload (0..255 bytes) | CRC-16 (little endian)
 * The CRC covers type, channel, length and payload. The encoded frame is followed by a 0x00
 * delimiter, which can never occur inside the encoded data.
 */
export const PROTOCOL_VERSION = 1;
export const FRAME_START = 0x7e;
export const MAX_PAYLOAD = 255;

const HEADER_LENGTH = 4;
const CRC_LENGTH = 2;
const MAX_RAW_FRAME = HEADER_LENGTH + MAX_PAYLOAD + CRC_LENGTH;
/** Largest possible encoded frame, without its delimiter. */
export const MAX_ENCODED_FRAME = MAX_RAW_FRAME + Math.floor(MAX_RAW_FRAME / 254) + 1;

/** INJ-04: logical channels multiplexed over one USB connection. */
export enum Channel {
  Control = 0,
  SensorValues = 1, // PC to board
  ActuatorEvents = 2, // board to PC
  UserSerial = 3,
  Telemetry = 4,
}

export interface Frame {
  type: number;
  channel: Channel;
  payload: Uint8Array;
}

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

function isChannel(value: number): value is Channel {
  return Channel[value] !== undefined;
}

/** Returns the wire bytes for one frame, including the trailing 0x00 delimiter. */
export function encodeFrame(frame: Frame): Uint8Array {
  if (!Number.isInteger(frame.type) || frame.type < 0 || frame.type > 255) {
    throw new FrameError(`frame type ${frame.type} is not a byte`);
  }
  if (!isChannel(frame.channel)) throw new FrameError(`unknown channel ${frame.channel}`);
  const length = frame.payload.length;
  if (length > MAX_PAYLOAD) {
    throw new FrameError(`payload of ${length} bytes exceeds the maximum of ${MAX_PAYLOAD}`);
  }

  const raw = new Uint8Array(HEADER_LENGTH + length + CRC_LENGTH);
  raw[0] = FRAME_START;
  raw[1] = frame.type;
  raw[2] = frame.channel;
  raw[3] = length;
  raw.set(frame.payload, HEADER_LENGTH);
  const crc = crc16(raw.subarray(1, HEADER_LENGTH + length));
  raw[HEADER_LENGTH + length] = crc & 0xff;
  raw[HEADER_LENGTH + length + 1] = crc >> 8;

  const encoded = cobsEncode(raw);
  const wire = new Uint8Array(encoded.length + 1);
  wire.set(encoded);
  return wire; // last byte is already 0x00
}

/** Decodes one frame given WITHOUT its delimiter. Throws FrameError if it is not valid. */
export function decodeFrame(wire: Uint8Array): Frame {
  let raw: Uint8Array;
  try {
    raw = cobsDecode(wire);
  } catch (error) {
    if (error instanceof CobsError) throw new FrameError(`bad encoding: ${error.message}`);
    throw error;
  }
  if (raw.length < HEADER_LENGTH + CRC_LENGTH) throw new FrameError("frame too short");
  if (raw[0] !== FRAME_START) throw new FrameError("missing start byte");
  const length = raw[3]!;
  if (raw.length !== HEADER_LENGTH + length + CRC_LENGTH) throw new FrameError("length mismatch");

  const expected = crc16(raw.subarray(1, HEADER_LENGTH + length));
  const actual = raw[HEADER_LENGTH + length]! | (raw[HEADER_LENGTH + length + 1]! << 8);
  if (expected !== actual) throw new FrameError("CRC mismatch");

  const channel = raw[2]!;
  if (!isChannel(channel)) throw new FrameError(`unknown channel ${channel}`);
  return { type: raw[1]!, channel, payload: raw.slice(HEADER_LENGTH, HEADER_LENGTH + length) };
}

export interface ParseResult {
  frames: Frame[];
  errors: FrameError[];
}

/**
 * Stream parser for the serial side. Feed it whatever chunks the port delivers; it splits on
 * the 0x00 delimiter, drops corrupt frames and carries on with the next one.
 */
export class FrameParser {
  private buffer: number[] = [];
  private overflowed = false;

  push(chunk: Uint8Array): ParseResult {
    const result: ParseResult = { frames: [], errors: [] };
    for (const byte of chunk) {
      if (byte !== 0) {
        this.append(byte);
        continue;
      }
      this.finishFrame(result);
    }
    return result;
  }

  /** Forget any partially received frame, for example after the port reconnects. */
  reset(): void {
    this.buffer = [];
    this.overflowed = false;
  }

  private append(byte: number): void {
    if (this.overflowed) return;
    if (this.buffer.length >= MAX_ENCODED_FRAME) {
      this.overflowed = true;
      this.buffer = [];
      return;
    }
    this.buffer.push(byte);
  }

  private finishFrame(result: ParseResult): void {
    if (this.overflowed) {
      result.errors.push(new FrameError("frame exceeds the maximum size"));
      this.reset();
      return;
    }
    if (this.buffer.length === 0) return; // back-to-back delimiters carry no frame
    const wire = Uint8Array.from(this.buffer);
    this.buffer = [];
    try {
      result.frames.push(decodeFrame(wire));
    } catch (error) {
      if (!(error instanceof FrameError)) throw error;
      result.errors.push(error);
    }
  }
}
