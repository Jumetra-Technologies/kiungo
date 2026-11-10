/**
 * The Hybrid link's PC side: COBS, frames, and the shim generator (INJ-01, INJ-03, INJ-04).
 * The board side is checked against real compiled code in apps/desktop/test/hybrid-shim.test.ts.
 */

import { describe, expect, it } from "vitest";

import { CobsStream, cobsDecode, cobsEncode } from "../src/hybrid/cobs";
import { LinkReader, MAX_SENSORS, decodeFrame, encodeHello, encodeIn, encodePing, encodeSet } from "../src/hybrid/protocol";
import { SPRINT_2_PLAN, generateShim, pinTable } from "../src/hybrid/shim";

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
    expect(Array.from(cobsEncode(Uint8Array.of(0x11, 0x22, 0x00, 0x33)))).toEqual([0x03, 0x11, 0x22, 0x02, 0x33, 0x00]);
  });

  it("splits a byte stream into frames and survives garbage", () => {
    const stream = new CobsStream();
    const a = cobsEncode(Uint8Array.of(1, 2, 3));
    const b = cobsEncode(Uint8Array.of(0x82, 0x30, 0x0d, 0x0a));
    const garbage = Uint8Array.of(0x09, 0x01, 0x00); // code says 8 bytes follow; only one does
    const all = Uint8Array.from([...a.subarray(0, 2), ...a.subarray(2), 0, 0, ...garbage, ...b]);
    const frames: number[][] = [];
    for (const byte of all) frames.push(...stream.feed(Uint8Array.of(byte)).map((f) => Array.from(f)));
    expect(frames).toEqual([[1, 2, 3], [0x82, 0x30, 0x0d, 0x0a]]);
    expect(stream.bad).toBe(1);
  });
});

describe("frames", () => {
  it("encodes SET as type, sensor, little-endian int32", () => {
    expect(Array.from(cobsDecode(encodeSet(0, 30).subarray(0, -1)))).toEqual([0x02, 0, 30, 0, 0, 0]);
    expect(Array.from(cobsDecode(encodeSet(3, -2).subarray(0, -1)))).toEqual([0x02, 3, 0xfe, 0xff, 0xff, 0xff]);
    expect(() => encodeSet(MAX_SENSORS, 1)).toThrow(/out of range/);
    expect(() => encodeSet(0, 2 ** 40)).toThrow(/32 bits/);
  });

  it("encodes HELLO, PING and IN", () => {
    expect(Array.from(encodeHello())).toEqual([0x02, 0x01, 0x00]);
    expect(Array.from(cobsDecode(encodePing(7).subarray(0, -1)))).toEqual([0x04, 7]);
    const frames = encodeIn(new Uint8Array(100).fill(0x41));
    expect(frames).toHaveLength(2);
    expect(cobsDecode(frames[1].subarray(0, -1))).toHaveLength(39);
  });

  it("decodes what the board sends", () => {
    expect(decodeFrame(Uint8Array.of(0x81, 1, 8))).toEqual({ type: "hello", protocol: 1, sensors: 8 });
    expect(decodeFrame(Uint8Array.of(0x83, 9))).toEqual({ type: "ack", seq: 9 });
    expect(decodeFrame(Uint8Array.of(0x84, 0x34, 0x12, 2, 0, 1, 0))).toEqual({ type: "stats", framesIn: 0x1234, bad: 2, dropped: 1 });
    expect(decodeFrame(Uint8Array.of(0x7f, 1)).type).toBe("unknown");
  });

  it("collects the sketch's lines from TEXT frames, however they arrive", () => {
    const reader = new LinkReader();
    const text = (s: string) => cobsEncode(Uint8Array.from([0x82, ...new TextEncoder().encode(s)]));
    const bytes = Uint8Array.from([...text("12"), ...text("0\r\n"), ...encodeHello(), ...text("30\r\n1")]);
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

describe("shim generator", () => {
  it("maps pins to sensor ids and leaves the rest real", () => {
    const table = pinTable(SPRINT_2_PLAN);
    expect(table).toHaveLength(20);
    expect(table[9]).toBe(0);
    expect(table[10]).toBe(0);
    expect(table.filter((v) => v === 0xff)).toHaveLength(18);
  });

  it("refuses bad plans", () => {
    expect(() => pinTable({ board: "arduino:avr:uno", sensors: [{ id: 8, part: "x", pins: [1] }] })).toThrow(/out of range/);
    expect(() => pinTable({ board: "arduino:avr:uno", sensors: [{ id: 0, part: "x", pins: [1] }, { id: 0, part: "y", pins: [2] }] })).toThrow(/twice/);
    expect(() => pinTable({ board: "arduino:avr:uno", sensors: [{ id: 0, part: "x", pins: [1] }, { id: 1, part: "y", pins: [1] }] })).toThrow(/two virtual sensors/);
    expect(() => pinTable({ board: "arduino:avr:uno", sensors: [{ id: 0, part: "x", pins: [20] }] })).toThrow(/doesn't exist/);
  });

  it("writes a header the core can't see and the sketch can", () => {
    const shim = generateShim(SPRINT_2_PLAN, "/build/kiungo_shim.h");
    expect(shim.cppFlags).toEqual(["-include", "/build/kiungo_shim.h"]);
    expect(shim.adapters).toEqual(["NewPing"]);
    expect(shim.header).toContain("#if __has_include(<kiungo_hybrid_marker.h>)");
    expect(shim.header).toContain("#define KIUNGO_PIN_TABLE {0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0xff");
    expect(shim.header).toContain("#define Serial kiungoSerial");
    expect(shim.header).toContain("#define digitalRead kiungo_digitalRead");
    expect(shim.header).toContain("sensor 0: hc-sr04 on pins 9, 10 (adapter: NewPing)");
  });

  it("with no virtual sensors still redirects Serial", () => {
    const shim = generateShim({ board: "arduino:avr:uno", sensors: [] });
    expect(shim.adapters).toEqual([]);
    expect(shim.header).toContain("only Serial is redirected");
    expect(shim.pinTable.every((v) => v === 0xff)).toBe(true);
  });
});
