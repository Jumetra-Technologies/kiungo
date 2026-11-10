/**
 * COBS (Consistent Overhead Byte Stuffing). Frames on the Hybrid link are
 * COBS-encoded and end with a 0x00, so a receiver can resynchronize after any
 * corruption by waiting for the next zero (INJ-04).
 *
 * The board's decoder is in apps/desktop/resources/hybrid/KiungoHybrid/src/kiungo_hybrid.cpp
 * and must stay byte-compatible with this one.
 */

/** Encode `data` and append the 0x00 delimiter. */
export function cobsEncode(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + Math.ceil(data.length / 254) + 2);
  let codeAt = 0;
  let code = 1;
  let w = 1;
  for (const byte of data) {
    if (byte === 0) {
      out[codeAt] = code;
      codeAt = w++;
      code = 1;
    } else {
      out[w++] = byte;
      code++;
      if (code === 0xff) {
        out[codeAt] = code;
        codeAt = w++;
        code = 1;
      }
    }
  }
  out[codeAt] = code;
  out[w++] = 0;
  return out.subarray(0, w);
}

/** Decode one frame without its delimiter. Throws on a malformed frame. */
export function cobsDecode(encoded: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < encoded.length) {
    const code = encoded[i++];
    if (code === 0) throw new Error("COBS: a zero inside the frame");
    if (i + code - 1 > encoded.length) throw new Error("COBS: the frame is shorter than its code byte says");
    for (let n = 1; n < code; n++) out.push(encoded[i++]);
    if (code !== 0xff && i < encoded.length) out.push(0);
  }
  return Uint8Array.from(out);
}

/**
 * Splits a byte stream into decoded frames. Feed it whatever the serial
 * port delivers; it keeps partial frames between calls.
 */
export class CobsStream {
  private buffer: number[] = [];
  /** Frames that failed to decode since the stream was created. */
  bad = 0;

  feed(bytes: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    for (const byte of bytes) {
      if (byte !== 0) {
        this.buffer.push(byte);
        continue;
      }
      if (this.buffer.length === 0) continue; // back-to-back delimiters are idle filler
      try {
        frames.push(cobsDecode(Uint8Array.from(this.buffer)));
      } catch {
        this.bad++;
      }
      this.buffer = [];
    }
    return frames;
  }
}
