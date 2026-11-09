/**
 * Consistent Overhead Byte Stuffing. The encoded output never contains a zero byte, so 0x00
 * can be used as a frame delimiter and a receiver can resynchronise after any corruption.
 */
export class CobsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CobsError";
  }
}

export function cobsEncode(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length + Math.floor(input.length / 254) + 1);
  let read = 0;
  let write = 1;
  let codeIndex = 0;
  let code = 1;
  while (read < input.length) {
    if (code !== 0xff) {
      const byte = input[read++]!;
      if (byte !== 0) {
        out[write++] = byte;
        code++;
        continue;
      }
    }
    out[codeIndex] = code;
    codeIndex = write++;
    code = 1;
  }
  out[codeIndex] = code;
  return out.subarray(0, write);
}

export function cobsDecode(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const code = input[i]!;
    if (code === 0) throw new CobsError("zero byte inside encoded data");
    const end = i + code;
    if (end > input.length) throw new CobsError("block runs past the end of the data");
    for (let j = i + 1; j < end; j++) {
      const byte = input[j]!;
      if (byte === 0) throw new CobsError("zero byte inside encoded data");
      out.push(byte);
    }
    i = end;
    if (code !== 0xff && i < input.length) out.push(0);
  }
  return Uint8Array.from(out);
}
