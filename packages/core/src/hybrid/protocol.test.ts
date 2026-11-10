import { describe, expect, it } from "vitest";
import { cobsDecode, cobsEncode } from "./cobs";
import {
  LinkReader,
  MAX_SENSORS,
  decodeFrame,
  encodeHello,
  encodeIn,
  encodePing,
  encodeSet,
} from "./protocol";

describe("frames", () => {
  it("encodes SET as type, sensor, little-endian int32", () => {
    expect(Array.from(cobsDecode(encodeSet(0, 30).subarray(0, -1)))).toEqual([
      0x02, 0, 30, 0, 0, 0,
    ]);
    expect(Array.from(cobsDecode(encodeSet(3, -2).subarray(0, -1)))).toEqual([
      0x02, 3, 0xfe, 0xff, 0xff, 0xff,
    ]);
    expect(() => encodeSet(MAX_SENSORS, 1)).toThrow(/out of range/);
    expect(() => encodeSet(0, 2 ** 40)).toThrow(/32 bits/);
  });

  it("encodes HELLO, PING and IN", () => {
    expect(Array.from(encodeHello())).toEqual([0x02, 0x01, 0x00]);
    expect(Array.from(cobsDecode(encodePing(7).subarray(0, -1)))).toEqual([0x04, 7]);
    const frames = encodeIn(new Uint8Array(100).fill(0x41));
    expect(frames).toHaveLength(2);
    expect(cobsDecode(frames[1]!.subarray(0, -1))).toHaveLength(39);
  });

  it("decodes what the board sends", () => {
    expect(decodeFrame(Uint8Array.of(0x81, 1, 8))).toEqual({
      type: "hello",
      protocol: 1,
      sensors: 8,
    });
    expect(decodeFrame(Uint8Array.of(0x83, 9))).toEqual({ type: "ack", seq: 9 });
    expect(decodeFrame(Uint8Array.of(0x84, 0x34, 0x12, 2, 0, 1, 0))).toEqual({
      type: "stats",
      framesIn: 0x1234,
      bad: 2,
      dropped: 1,
    });
    expect(decodeFrame(Uint8Array.of(0x7f, 1)).type).toBe("unknown");
  });

  it("collects the sketch's lines from TEXT frames, however they arrive", () => {
    const reader = new LinkReader();
    const text = (s: string) => cobsEncode(Uint8Array.from([0x82, ...new TextEncoder().encode(s)]));
    const bytes = Uint8Array.from([
      ...text("12"),
      ...text("0\r\n"),
      ...encodeHello(),
      ...text("30\r\n1"),
    ]);
    const lines: string[] = [];
    let frames = 0;
    for (const byte of bytes) {
      const result = reader.feedLines(Uint8Array.of(byte));
      lines.push(...result.lines);
      frames += result.frames.length;
    }
    expect(lines).toEqual(["120", "30"]);
    expect(frames).toBe(4);
    expect(reader.feedLines(text("\n")).lines).toEqual(["1"]);
  });
});
