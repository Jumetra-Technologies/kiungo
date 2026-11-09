import { describe, expect, it } from "vitest";
import { cobsDecode, cobsEncode } from "./cobs";
import { crc16 } from "./crc";
import {
  Channel,
  FRAME_START,
  Frame,
  FrameError,
  FrameParser,
  MAX_ENCODED_FRAME,
  MAX_PAYLOAD,
  decodeFrame,
  encodeFrame,
} from "./frame";

const frame = (channel: Channel, payload: number[] = [], type = 1): Frame => ({
  type,
  channel,
  payload: Uint8Array.from(payload),
});

const withoutDelimiter = (wire: Uint8Array) => wire.subarray(0, wire.length - 1);

/** Builds wire bytes for a raw (pre-COBS) frame so tests can craft invalid ones. */
function wireFromRaw(raw: number[]): Uint8Array {
  return withoutDelimiter(Uint8Array.from([...cobsEncode(Uint8Array.from(raw)), 0]));
}

function rawWithCrc(body: number[]): number[] {
  const crc = crc16(Uint8Array.from(body));
  return [FRAME_START, ...body, crc & 0xff, crc >> 8];
}

describe("encodeFrame / decodeFrame", () => {
  it.each([
    Channel.Control,
    Channel.SensorValues,
    Channel.ActuatorEvents,
    Channel.UserSerial,
    Channel.Telemetry,
  ])("round-trips a frame on channel %i", (channel) => {
    const original = frame(channel, [0, 1, 2, 0, 255], 9);
    const decoded = decodeFrame(withoutDelimiter(encodeFrame(original)));
    expect(decoded.type).toBe(9);
    expect(decoded.channel).toBe(channel);
    expect(Array.from(decoded.payload)).toEqual([0, 1, 2, 0, 255]);
  });

  it("round-trips an empty payload", () => {
    const decoded = decodeFrame(withoutDelimiter(encodeFrame(frame(Channel.Control))));
    expect(decoded.payload.length).toBe(0);
  });

  it("round-trips the largest payload, even when it is all zeros", () => {
    const payload = new Array<number>(MAX_PAYLOAD).fill(0);
    const wire = encodeFrame(frame(Channel.Telemetry, payload));
    expect(wire.length - 1).toBeLessThanOrEqual(MAX_ENCODED_FRAME);
    expect(decodeFrame(withoutDelimiter(wire)).payload.length).toBe(MAX_PAYLOAD);
  });

  it("ends every frame with a single delimiter and has no other zero byte", () => {
    const wire = encodeFrame(frame(Channel.SensorValues, [0, 0, 0, 7]));
    expect(wire[wire.length - 1]).toBe(0);
    expect(wire.subarray(0, wire.length - 1).includes(0)).toBe(false);
  });

  it("refuses a payload that is too large", () => {
    const tooBig = frame(Channel.UserSerial, new Array<number>(MAX_PAYLOAD + 1).fill(1));
    expect(() => encodeFrame(tooBig)).toThrow(/exceeds the maximum/);
  });

  it.each([-1, 256, 1.5, Number.NaN])("refuses frame type %s", (type) => {
    expect(() => encodeFrame(frame(Channel.Control, [], type))).toThrow(FrameError);
  });

  it("refuses an unknown channel", () => {
    expect(() =>
      encodeFrame({ type: 1, channel: 99 as Channel, payload: new Uint8Array() }),
    ).toThrow(/unknown channel/);
  });

  it("detects a corrupted payload byte through the CRC", () => {
    const raw = rawWithCrc([1, Channel.Control, 2, 10, 20]);
    raw[4] = 11;
    expect(() => decodeFrame(wireFromRaw(raw))).toThrow(/CRC mismatch/);
  });

  it("rejects a frame without the start byte", () => {
    const raw = rawWithCrc([1, Channel.Control, 0]);
    raw[0] = 0x55;
    expect(() => decodeFrame(wireFromRaw(raw))).toThrow(/start byte/);
  });

  it("rejects a length field that disagrees with the data", () => {
    const raw = rawWithCrc([1, Channel.Control, 3, 10, 20]);
    expect(() => decodeFrame(wireFromRaw(raw))).toThrow(/length mismatch/);
  });

  it("rejects a frame that is too short", () => {
    expect(() => decodeFrame(wireFromRaw([FRAME_START, 1]))).toThrow(/too short/);
  });

  it("rejects an unknown channel even when the CRC is valid", () => {
    const raw = rawWithCrc([1, 77, 0]);
    expect(() => decodeFrame(wireFromRaw(raw))).toThrow(/unknown channel 77/);
  });

  it("wraps COBS errors in FrameError", () => {
    expect(() => decodeFrame(Uint8Array.from([5, 1]))).toThrow(FrameError);
  });

  it("encodes to something cobsDecode can read back to the raw frame", () => {
    const wire = withoutDelimiter(encodeFrame(frame(Channel.Control, [1, 2], 3)));
    expect(cobsDecode(wire)[0]).toBe(FRAME_START);
  });
});

describe("FrameParser", () => {
  const a = frame(Channel.SensorValues, [1, 2, 3], 1);
  const b = frame(Channel.ActuatorEvents, [0, 0], 2);

  it("parses back-to-back frames delivered in one chunk", () => {
    const chunk = Uint8Array.from([...encodeFrame(a), ...encodeFrame(b)]);
    const { frames, errors } = new FrameParser().push(chunk);
    expect(errors).toEqual([]);
    expect(frames.map((f) => f.type)).toEqual([1, 2]);
  });

  it("reassembles a frame split across many chunks", () => {
    const parser = new FrameParser();
    const wire = encodeFrame(a);
    const frames: Frame[] = [];
    for (const byte of wire) frames.push(...parser.push(Uint8Array.of(byte)).frames);
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0]!.payload)).toEqual([1, 2, 3]);
  });

  it("ignores repeated delimiters", () => {
    const { frames, errors } = new FrameParser().push(Uint8Array.from([0, 0, 0]));
    expect(frames).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("reports a corrupt frame and still parses the next one", () => {
    const bad = Uint8Array.from(encodeFrame(a));
    bad[3] = bad[3]! ^ 0x40;
    const chunk = Uint8Array.from([...bad, ...encodeFrame(b)]);
    const { frames, errors } = new FrameParser().push(chunk);
    expect(errors).toHaveLength(1);
    expect(frames.map((f) => f.type)).toEqual([2]);
  });

  it("resynchronises after leading garbage", () => {
    const chunk = Uint8Array.from([9, 9, 9, 0, ...encodeFrame(b)]);
    const { frames, errors } = new FrameParser().push(chunk);
    expect(errors).toHaveLength(1);
    expect(frames).toHaveLength(1);
  });

  it("discards an oversized run of bytes and recovers", () => {
    const parser = new FrameParser();
    const noise = new Uint8Array(MAX_ENCODED_FRAME + 50).fill(7);
    const first = parser.push(Uint8Array.from([...noise, 0]));
    expect(first.errors).toHaveLength(1);
    expect(first.errors[0]!.message).toMatch(/maximum size/);
    const second = parser.push(encodeFrame(a));
    expect(second.frames).toHaveLength(1);
  });

  it("reset drops a partial frame", () => {
    const parser = new FrameParser();
    const wire = encodeFrame(a);
    parser.push(wire.subarray(0, 3));
    parser.reset();
    const { frames, errors } = parser.push(encodeFrame(b));
    expect(errors).toEqual([]);
    expect(frames.map((f) => f.type)).toEqual([2]);
  });
});
