import { describe, expect, it } from "vitest";
import { CobsStream, cobsDecode, cobsEncode } from "./cobs";

describe("COBS", () => {
  const cases: Array<[string, number[]]> = [
    ["one byte", [1]],
    ["a zero", [0]],
    ["zeros around data", [0, 1, 0]],
    ["ends in a zero", [1, 2, 0]],
    ["the HELLO frame", [0x01]],
    ["a SET frame", [0x02, 0, 30, 0, 0, 0]],
    ["254 non-zero bytes", Array.from({ length: 254 }, (_, i) => (i % 255) + 1)],
    ["255 non-zero bytes", Array.from({ length: 255 }, (_, i) => (i % 255) + 1)],
    ["300 bytes with zeros", Array.from({ length: 300 }, (_, i) => i % 7)],
  ];
  for (const [name, bytes] of cases) {
    it(`round-trips ${name}`, () => {
      const encoded = cobsEncode(Uint8Array.from(bytes));
      expect(encoded.at(-1)).toBe(0);
      expect(encoded.subarray(0, -1).includes(0)).toBe(false);
      expect(Array.from(cobsDecode(encoded.subarray(0, -1)))).toEqual(bytes);
    });
  }

  it("encodes the known vectors", () => {
    expect(Array.from(cobsEncode(Uint8Array.of(0x01)))).toEqual([0x02, 0x01, 0x00]);
    expect(Array.from(cobsEncode(Uint8Array.of(0x00)))).toEqual([0x01, 0x01, 0x00]);
    expect(Array.from(cobsEncode(Uint8Array.of(0x11, 0x22, 0x00, 0x33)))).toEqual([
      0x03, 0x11, 0x22, 0x02, 0x33, 0x00,
    ]);
  });

  it("splits a byte stream into frames and survives garbage", () => {
    const stream = new CobsStream();
    const a = cobsEncode(Uint8Array.of(1, 2, 3));
    const b = cobsEncode(Uint8Array.of(0x82, 0x30, 0x0d, 0x0a));
    const garbage = Uint8Array.of(0x09, 0x01, 0x00); // code says 8 bytes follow; only one does
    const all = Uint8Array.from([...a.subarray(0, 2), ...a.subarray(2), 0, 0, ...garbage, ...b]);
    const frames: number[][] = [];
    for (const byte of all)
      frames.push(...stream.feed(Uint8Array.of(byte)).map((f) => Array.from(f)));
    expect(frames).toEqual([
      [1, 2, 3],
      [0x82, 0x30, 0x0d, 0x0a],
    ]);
    expect(stream.bad).toBe(1);
  });
});
