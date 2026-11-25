/**
 * Intel HEX: the text file Arduino IDE and Arduino CLI write for AVR boards
 * ("Sketch > Export Compiled Binary" makes `sketch.ino.hex`). Each line is a
 * record: `:LLAAAATT<data>CC`, length, address, type, data and a checksum.
 */

export class HexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HexError";
  }
}

/**
 * The program bytes from address 0 up to the last byte the file sets, with
 * gaps filled with 0xFF (erased flash). Throws a HexError in plain words when
 * the file isn't Intel HEX, a checksum is wrong, or the program is bigger
 * than `maxBytes`.
 */
export function parseIntelHex(text: string, maxBytes: number): Uint8Array {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !lines[0].startsWith(":")) throw new HexError("This isn't an Intel HEX file. Export it from the Arduino IDE with Sketch > Export Compiled Binary, and pick the .hex file.");
  const chunks: Array<{ at: number; bytes: number[] }> = [];
  let base = 0;
  let end = 0;
  let sawEnd = false;
  lines.forEach((line, i) => {
    if (sawEnd) return;
    if (!/^:[0-9A-Fa-f]+$/.test(line) || line.length < 11 || line.length % 2 === 0) throw new HexError(`Line ${i + 1} of the file isn't a HEX record.`);
    const bytes: number[] = [];
    for (let k = 1; k < line.length; k += 2) bytes.push(parseInt(line.slice(k, k + 2), 16));
    const [len, hi, lo, type] = bytes;
    if (bytes.length !== len + 5) throw new HexError(`Line ${i + 1} is the wrong length for the data it declares.`);
    const sum = bytes.reduce((a, b) => a + b, 0) & 0xff;
    if (sum !== 0) throw new HexError(`Line ${i + 1} has a bad checksum: the file is damaged. Export it again.`);
    const data = bytes.slice(4, 4 + len);
    if (type === 0x00) {
      const at = base + ((hi << 8) | lo);
      chunks.push({ at, bytes: data });
      end = Math.max(end, at + len);
    } else if (type === 0x01) {
      sawEnd = true;
    } else if (type === 0x02) {
      base = ((data[0] << 8) | data[1]) * 16;
    } else if (type === 0x04) {
      base = ((data[0] << 8) | data[1]) * 65536;
    }
    // 0x03 and 0x05 (start address) don't change the image.
  });
  if (!sawEnd) throw new HexError("The file ends before its end-of-file record: it's incomplete. Export it again.");
  if (!chunks.length) throw new HexError("The file has no program in it.");
  if (end > maxBytes) throw new HexError(`The program is ${end.toLocaleString()} bytes, more than the ${maxBytes.toLocaleString()} this board has room for.`);
  const image = new Uint8Array(end).fill(0xff);
  for (const c of chunks) image.set(c.bytes, c.at);
  return image;
}
