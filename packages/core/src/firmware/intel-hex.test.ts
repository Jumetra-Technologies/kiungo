import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HexError, parseIntelHex } from "./intel-hex";

const blink = readFileSync(join(__dirname, "../../test/fixtures/blink-uno.hex"), "utf8");
const record = (len: number, at: number, type: number, data: number[]) => {
  const bytes = [len, at >> 8, at & 0xff, type, ...data];
  const sum = (0x100 - (bytes.reduce((a, b) => a + b, 0) & 0xff)) & 0xff;
  return `:${[...bytes, sum].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
};
const EOF_RECORD = ":00000001FF";

describe("Intel HEX", () => {
  it("reads a compiled sketch into the bytes at their addresses", () => {
    const image = parseIntelHex(blink, 32256);
    expect(image.length).toBeGreaterThan(800);
    expect(image.length).toBeLessThan(1200);
    // The reset vector: a jmp to the start of the program.
    expect(image[0]).toBe(0x0c);
    expect(image[1]).toBe(0x94);
  });

  it("fills gaps with erased flash and follows segment and linear base records", () => {
    const text = [record(2, 0, 0, [1, 2]), record(1, 6, 0, [9]), EOF_RECORD].join("\n");
    expect([...parseIntelHex(text, 100)]).toEqual([1, 2, 0xff, 0xff, 0xff, 0xff, 9]);
    const seg = [record(2, 0, 2, [0x00, 0x01]), record(1, 0, 0, [7]), EOF_RECORD].join("\r\n");
    expect(parseIntelHex(seg, 100)[16]).toBe(7);
    const lin = [record(2, 0, 4, [0x00, 0x00]), record(1, 3, 0, [5]), EOF_RECORD].join("\n");
    expect(parseIntelHex(lin, 100)[3]).toBe(5);
  });

  it("refuses files that aren't HEX, are damaged, incomplete, empty or too big", () => {
    expect(() => parseIntelHex("hello", 100)).toThrow(/isn't an Intel HEX file/);
    expect(() => parseIntelHex(":zz", 100)).toThrow(/Line 1 of the file isn't a HEX record/);
    expect(() =>
      parseIntelHex(`${record(2, 0, 0, [1, 2]).slice(0, -2)}00\n${EOF_RECORD}`, 100),
    ).toThrow(/bad checksum/);
    // Says 4 data bytes, carries 3.
    expect(() => parseIntelHex(`:0400000001020300\n${EOF_RECORD}`, 100)).toThrow(/wrong length/);
    expect(() => parseIntelHex(record(1, 0, 0, [1]), 100)).toThrow(
      /ends before its end-of-file record/,
    );
    expect(() => parseIntelHex(EOF_RECORD, 100)).toThrow(/no program/);
    expect(() => parseIntelHex(blink, 100)).toThrow(/more than the 100 this board has room for/);
    expect(() => parseIntelHex("", 100)).toThrow(HexError);
  });

  it("ignores everything after the end-of-file record", () => {
    expect([
      ...parseIntelHex([record(1, 0, 0, [3]), EOF_RECORD, "garbage"].join("\n"), 10),
    ]).toEqual([3]);
  });
});
