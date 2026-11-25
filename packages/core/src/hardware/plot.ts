/**
 * The serial plotter's reading of a line (HW-02), as the Arduino IDE's
 * plotter reads it: numbers separated by spaces, tabs or commas, each
 * optionally named ("temp:21.5"). A line with no numbers isn't plotted.
 */

export interface PlotLine {
  /** Each value with its name: "temp", or "1", "2" for unnamed values in order. */
  values: Array<{ name: string; value: number }>;
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export function parsePlotLine(line: string): PlotLine | null {
  const text = line.trim();
  if (!text) return null;
  const fields = text.split(/[\s,]+/).filter(Boolean);
  const values: PlotLine["values"] = [];
  let unnamed = 0;
  for (const field of fields) {
    const colon = field.lastIndexOf(":");
    const name = colon > 0 ? field.slice(0, colon) : null;
    const raw = colon > 0 ? field.slice(colon + 1) : field;
    if (!NUMBER.test(raw)) {
      // A label in front of a value, Arduino style: "Distance: 12" splits into "Distance:" and "12".
      if (colon === field.length - 1 && colon > 0) continue;
      // Text after the numbers ("cm") ends the reading; text before them means it isn't one.
      if (!values.length) return null;
      break;
    }
    unnamed += name ? 0 : 1;
    values.push({ name: name ?? String(unnamed), value: Number(raw) });
  }
  // "Distance: 12 cm" names the value by the label before it.
  const labelled = /^([A-Za-z_][\w ]*?):\s+([-+]?\d+\.?\d*)\b/.exec(text);
  if (labelled && values.length === 1 && values[0].name === "1") values[0].name = labelled[1];
  return values.length ? { values } : null;
}

/** Splits incoming serial text into whole lines, keeping a partial last line for next time. */
export class LineSplitter {
  private rest = "";

  push(chunk: string): string[] {
    const text = this.rest + chunk;
    const parts = text.split(/\r?\n/);
    this.rest = parts.pop() ?? "";
    // A board that never sends a newline shouldn't grow this forever.
    if (this.rest.length > 4096) {
      parts.push(this.rest);
      this.rest = "";
    }
    return parts;
  }
}
