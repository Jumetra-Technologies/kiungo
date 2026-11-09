import { describe, expect, it } from "vitest";
import { crc16 } from "./crc";

describe("crc16", () => {
  it("matches the CRC-16/CCITT-FALSE check value", () => {
    expect(crc16(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });

  it("returns the initial value for empty input", () => {
    expect(crc16(new Uint8Array())).toBe(0xffff);
  });

  it("changes when a single bit changes", () => {
    const a = Uint8Array.from([1, 2, 3, 4]);
    const b = Uint8Array.from([1, 2, 3, 5]);
    expect(crc16(a)).not.toBe(crc16(b));
  });

  it("always fits in 16 bits", () => {
    for (let i = 0; i < 256; i++) {
      const value = crc16(Uint8Array.from([i, 255 - i, i ^ 0x5a]));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffff);
    }
  });
});
