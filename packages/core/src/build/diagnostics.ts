/**
 * Compiler problems, mapped to the line and explained (ERR-01, ERR-02, FIX-01).
 *
 * Arduino CLI runs avr-gcc on the sketch with `#line` directives, so GCC's
 * messages name the sketch's own files and lines. This turns that output
 * into problems the editor can mark, explains the common ones in plain
 * words, and works out a fix where one is certain enough to offer.
 */

export type Severity = "error" | "warning";

export interface Diagnostic {
  /** The file in the sketch folder ("sketch.ino", "motor.h"), or null for a file outside it (the core, a library). */
  file: string | null;
  /** The path as the compiler printed it. */
  path: string;
  line: number;
  column: number;
  severity: Severity;
  message: string;
  /** Notes GCC added: a suggested name, where something was declared. */
  notes: Array<{ file: string | null; line: number; message: string }>;
}

const LINE = /^(.*?):(\d+):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/;

const LINKER =
  /^(?:.*[\\/])?(?:ld|ld\.exe|avr-ld)(?:\.exe)?:\s*(.*)$|^.*?:\s*\(\.text.*?\):\s*(undefined reference to .*)$|^.*?:\s*(undefined reference to .*)$/;

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/** The file's name inside the sketch folder, or null when the path is elsewhere. */
function inSketch(path: string, sketchDirs: readonly string[]): string | null {
  const p = norm(path);
  const lower = (s: string) => s.toLowerCase();
  for (const sketchDir of sketchDirs) {
    const dir = norm(sketchDir);
    // Windows paths compare without case.
    const under = p.startsWith(`${dir}/`) || lower(p).startsWith(`${lower(dir)}/`);
    if (!under) continue;
    const rest = p.slice(dir.length + 1);
    return rest.includes("/") ? null : rest;
  }
  return null;
}

/** A compiler line: an error or warning in the sketch, or a note on the one before it. */
function compilerLine(
  m: RegExpExecArray,
  dirs: readonly string[],
  out: Diagnostic[],
  state: { skipNotes: boolean },
) {
  const [, path = "", line, column, kind, message = ""] = m;
  const file = inSketch(path, dirs);
  if (kind === "note") {
    if (!state.skipNotes)
      out[out.length - 1]?.notes.push({ file, line: Number(line), message: message.trim() });
    return;
  }
  state.skipNotes = false;
  const severity: Severity = kind === "warning" ? "warning" : "error";
  // Warnings from the board core or a library aren't the sketch's problem (the compiler is quiet about them in a normal build).
  if (severity === "warning" && !file) {
    state.skipNotes = true;
    return;
  }
  out.push({
    file,
    path,
    line: Number(line),
    column: Number(column),
    severity,
    message: message.trim(),
    notes: [],
  });
}

/** The linker has no line numbers: "region `text' overflowed by 1024 bytes", "undefined reference to `setup'". */
function linkerLine(raw: string, out: Diagnostic[]) {
  const l = LINKER.exec(raw);
  if (!l) return;
  const message = (l[1] ?? l[2] ?? l[3] ?? "").trim();
  if (
    /overflowed|undefined reference|will not fit/.test(message) &&
    !out.some((d) => d.message === message)
  ) {
    out.push({
      file: null,
      path: "",
      line: 0,
      column: 0,
      severity: "error",
      message,
      notes: [],
    });
  }
}

/**
 * Problems from compiler and linker output, in order, errors and warnings with their notes.
 * `sketchDir` can be several spellings of the same folder: Arduino CLI names files by the
 * folder's real path, which on Windows can differ from the one Kiungo has (8.3 short names).
 */
export function parseDiagnostics(
  output: string,
  sketchDir: string | readonly string[],
): Diagnostic[] {
  const dirs = typeof sketchDir === "string" ? [sketchDir] : sketchDir;
  const out: Diagnostic[] = [];
  const state = { skipNotes: false };
  for (const raw of output.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (m) compilerLine(m, dirs, out, state);
    else linkerLine(raw, out);
  }
  // Arduino CLI's own words when the program is too big for the board.
  const tooBig = /Sketch too big|text section exceeds available space in board/.exec(output);
  if (tooBig && !out.some((d) => /overflowed|too big|will not fit/i.test(d.message)))
    out.push({
      file: null,
      path: "",
      line: 0,
      column: 0,
      severity: "error",
      message: "Sketch too big",
      notes: [],
    });
  // GCC reports an unclosed " as a warning and then an error at the same place: keep the error.
  return out.filter(
    (d, i) =>
      !(
        d.severity === "warning" &&
        out.some(
          (e, j) =>
            j !== i &&
            e.severity === "error" &&
            e.file === d.file &&
            e.line === d.line &&
            e.column === d.column &&
            e.message === d.message,
        )
      ),
  );
}

// ----- explanations ------------------------------------------------------------------

/** One change to a file: 1-based line and column, as the editor counts. */
export interface Edit {
  line: number;
  column: number;
  /** Characters to replace from `column` (0 inserts). */
  length: number;
  text: string;
}

export interface QuickFix {
  /** What the button says: "Add the missing ;". */
  title: string;
  file: string;
  edits: Edit[];
}

export interface Explanation {
  /** The catalog entry, stable for tests and analytics. */
  id: string;
  /** One line in plain words. */
  title: string;
  /** What it means and what to do, for someone writing their first sketch. */
  text: string;
  /** For a missing library: the header the sketch asked for. */
  header?: string;
}

export const NOT_DECLARED = /^'([A-Za-z_]\w*)' was not declared in this scope$/;

const SUGGESTED = /^suggested alternative: '([A-Za-z_][\w:]*)'$/;

/** Edit distance, for judging whether GCC's suggested name is the one meant. */
function distance(a: string, b: string): number {
  // One row at a time: prev is row i - 1, row is row i.
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/** GCC's suggestion, only when it's plausibly the name meant: same letters in another case, or one or two typos in a longer name. */
export function likelyName(wrong: string, diag: Diagnostic): string | null {
  for (const note of diag.notes) {
    const s = SUGGESTED.exec(note.message);
    if (!s) continue;
    const [, right = ""] = s;
    if (right.toLowerCase() === wrong.toLowerCase()) return right;
    if (wrong.length >= 5 && distance(wrong.toLowerCase(), right.toLowerCase()) <= 2) return right;
  }
  return null;
}
