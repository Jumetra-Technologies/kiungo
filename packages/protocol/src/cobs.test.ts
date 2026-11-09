import { describe, expect, it } from "vitest";
import { CobsError, cobsDecode, cobsEncode } from "./cobs";

const bytes = (...values: number[]) => Uint8Array.from(values);
const range = (from: number, to: number) =>
  bytes(...Array.from({ length: to - from + 1 }, (_, i) => from + i));

/** Small deterministic generator so the round-trip test is reproducible. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

describe("cobsEncode", () => {
  it.each([
    [[], [0x01]],
    [[0x00], [0x01, 0x01]],
    [
      [0x00, 0x00],
      [0x01, 0x01, 0x01],
    ],
    [
      [0x11, 0x22, 0x00, 0x33],
      [0x03, 0x11, 0x22, 0x02, 0x33],
    ],
    [
      [0x11, 0x22, 0x33, 0x44],
      [0x05, 0x11, 0x22, 0x33, 0x44],
    ],
    [
      [0x11, 0x00, 0x00, 0x00],
      [0x02, 0x11, 0x01, 0x01, 0x01],
    ],
  ])("encodes %j as %j", (input, expected) => {
    expect(Array.from(cobsEncode(bytes(...input)))).toEqual(expected);
  });

  it("encodes 254 non-zero bytes as one full block", () => {
    const encoded = cobsEncode(range(1, 254));
    expect(Array.from(encoded)).toEqual([0xff, ...Array.from(range(1, 254))]);
  });

  it("starts a second block after 254 non-zero bytes", () => {
    const encoded = cobsEncode(range(1, 255));
    expect(Array.from(encoded)).toEqual([0xff, ...Array.from(range(1, 254)), 0x02, 0xff]);
  });

  it("never emits a zero byte", () => {
    const next = lcg(7);
    const input = Uint8Array.from({ length: 1000 }, () => (next() % 3 === 0 ? 0 : next()));
    expect(cobsEncode(input).includes(0)).toBe(false);
  });
});

describe("cobsDecode", () => {
  it("round-trips random data of many lengths", () => {
    const next = lcg(42);
    for (const length of [0, 1, 2, 253, 254, 255, 256, 508, 509, 1000]) {
      const input = Uint8Array.from({ length }, () => (next() % 4 === 0 ? 0 : next()));
      expect(Array.from(cobsDecode(cobsEncode(input)))).toEqual(Array.from(input));
    }
  });

  it("rejects a zero byte inside a block header", () => {
    expect(() => cobsDecode(bytes(0x00))).toThrow(CobsError);
  });

  it("rejects a zero byte inside block data", () => {
    expect(() => cobsDecode(bytes(0x03, 0x11, 0x00))).toThrow(CobsError);
  });

  it("rejects a block that runs past the end", () => {
    expect(() => cobsDecode(bytes(0x05, 0x11, 0x22))).toThrow(/past the end/);
  });
});
