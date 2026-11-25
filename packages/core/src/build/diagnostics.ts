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
const LINKER = /^(?:.*[\\/])?(?:ld|ld\.exe|avr-ld)(?:\.exe)?:\s*(.*)$|^.*?:\s*\(\.text.*?\):\s*(undefined reference to .*)$|^.*?:\s*(undefined reference to .*)$/;

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

/**
 * Problems from compiler and linker output, in order, errors and warnings with their notes.
 * `sketchDir` can be several spellings of the same folder: Arduino CLI names files by the
 * folder's real path, which on Windows can differ from the one Kiungo has (8.3 short names).
 */
export function parseDiagnostics(output: string, sketchDir: string | readonly string[]): Diagnostic[] {
  const dirs = typeof sketchDir === "string" ? [sketchDir] : sketchDir;
  const out: Diagnostic[] = [];
  let skipNotes = false;
  for (const raw of output.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (m) {
      const [, path, line, column, kind, message] = m;
      const file = inSketch(path, dirs);
      if (kind === "note") {
        if (!skipNotes) out[out.length - 1]?.notes.push({ file, line: Number(line), message: message.trim() });
        continue;
      }
      skipNotes = false;
      const severity: Severity = kind === "warning" ? "warning" : "error";
      // Warnings from the board core or a library aren't the sketch's problem (the compiler is quiet about them in a normal build).
      if (severity === "warning" && !file) {
        skipNotes = true;
        continue;
      }
      out.push({ file, path, line: Number(line), column: Number(column), severity, message: message.trim(), notes: [] });
      continue;
    }
    // The linker has no line numbers: "region `text' overflowed by 1024 bytes", "undefined reference to `setup'".
    const l = LINKER.exec(raw);
    if (l) {
      const message = (l[1] ?? l[2] ?? l[3] ?? "").trim();
      if (/overflowed|undefined reference|will not fit/.test(message) && !out.some((d) => d.message === message)) {
        out.push({ file: null, path: "", line: 0, column: 0, severity: "error", message, notes: [] });
      }
    }
  }
  // Arduino CLI's own words when the program is too big for the board.
  const tooBig = /Sketch too big|text section exceeds available space in board/.exec(output);
  if (tooBig && !out.some((d) => /overflowed|too big|will not fit/i.test(d.message))) out.push({ file: null, path: "", line: 0, column: 0, severity: "error", message: "Sketch too big", notes: [] });
  // GCC reports an unclosed " as a warning and then an error at the same place: keep the error.
  return out.filter((d, i) => !(d.severity === "warning" && out.some((e, j) => j !== i && e.severity === "error" && e.file === d.file && e.line === d.line && e.column === d.column && e.message === d.message)));
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

const NOT_DECLARED = /^'([A-Za-z_]\w*)' was not declared in this scope$/;
const SUGGESTED = /^suggested alternative: '([A-Za-z_][\w:]*)'$/;

/** Edit distance, for judging whether GCC's suggested name is the one meant. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** GCC's suggestion, only when it's plausibly the name meant: same letters in another case, or one or two typos in a longer name. */
export function likelyName(wrong: string, diag: Diagnostic): string | null {
  for (const note of diag.notes) {
    const s = SUGGESTED.exec(note.message);
    if (!s) continue;
    const right = s[1];
    if (right.toLowerCase() === wrong.toLowerCase()) return right;
    if (wrong.length >= 5 && distance(wrong.toLowerCase(), right.toLowerCase()) <= 2) return right;
  }
  return null;
}

/** The catalog of common problems (ERR-02). Null for anything else: the compiler's own words are shown. */
export function explain(diag: Diagnostic, board = "the board"): Explanation | null {
  const m = diag.message;
  if (/^expected (?:',' or )?';' before /.test(m)) {
    return { id: "missing-semicolon", title: "A semicolon is missing", text: "Every instruction in Arduino code ends with a ;. The line before the one marked, or the end of the marked line, is missing one." };
  }
  const after = /^expected ';' after (class|struct|union|enum) definition$/.exec(m);
  if (after) {
    return { id: "missing-semicolon", title: `A ; is missing after the ${after[1]}`, text: `A ${after[1]} definition ends with }; — the semicolon after the closing brace is easy to forget.` };
  }
  const nd = NOT_DECLARED.exec(m);
  if (nd) {
    const right = likelyName(nd[1], diag);
    if (right && right.toLowerCase() === nd[1].toLowerCase()) {
      return { id: "wrong-case", title: `${nd[1]} should be ${right}`, text: `Arduino code cares about capital letters, so ${nd[1]} and ${right} are different names. The one that exists is ${right}.` };
    }
    if (right) return { id: "misspelled", title: `${nd[1]} isn't defined. Did you mean ${right}?`, text: `There's no ${nd[1]} in this sketch or its libraries. ${right} is close: check the spelling.` };
    return { id: "not-declared", title: `${nd[1]} isn't defined`, text: `The code uses ${nd[1]}, but nothing creates it. Check the spelling and capital letters, or declare it before it's used${/pin/i.test(nd[1]) ? `, for example at the top of the sketch: const int ${nd[1]} = 13;` : "."}` };
  }
  const header = /^([\w./+-]+\.h(?:pp)?): No such file or directory$/.exec(m);
  if (header) {
    return { id: "missing-library", title: `The library for ${header[1]} isn't in this sketch`, text: `${header[1]} comes from an Arduino library. Add the library to the sketch and build again: Kiungo downloads it the first time.`, header: header[1] };
  }
  if (/^expected '}' at end of input$/.test(m)) {
    return { id: "missing-brace", title: "A } is missing", text: "Something opened with { never closes. Each function, if and loop needs its own } at the end. Look just above the line marked." };
  }
  if (/^a function-definition is not allowed here before '\{' token$/.test(m)) {
    return { id: "missing-brace", title: "The function above isn't closed", text: "The function before the one marked is missing its closing }, so this one looks like it's inside it. Add } where the function above ends." };
  }
  const args = /^too (few|many) arguments to function '(.+)'$/.exec(m);
  if (args) {
    const signature = args[2].replace(/^[\w\s*&:<>]*?\s+(?=[\w:]+\()/, "");
    const fn = /^([\w:]+)\(/.exec(signature)?.[1] ?? signature;
    const params = /\((.*)\)/.exec(signature)?.[1].trim() ?? "";
    const count = params && params !== "void" ? params.split(",").length : 0;
    return {
      id: "wrong-arguments",
      title: `${fn} needs ${args[1] === "few" ? "more" : "fewer"} values`,
      text: `${fn} takes ${count === 1 ? "1 value" : `${count} values`}, separated by commas: ${signature}.`,
    };
  }
  if (/^missing terminating " character$/.test(m)) {
    return { id: "unclosed-text", title: 'Some text is missing its closing "', text: 'Text in code starts and ends with a ". The marked line opens one and never closes it.' };
  }
  const redef = /^redefinition of '(.+)'$/.exec(m);
  if (redef) {
    const name = /\b(\w+)\(/.exec(redef[1])?.[1] ?? redef[1];
    return { id: "defined-twice", title: `${name} is written twice`, text: name === "setup" || name === "loop" ? `A sketch has exactly one ${name}(). Move what's in the second one into the first, then delete the second.` : `There are two ${name}s. Rename one, or delete the copy.` };
  }
  if (/overflowed by \d+ bytes|will not fit in region|^Sketch too big$/.test(m)) {
    const over = /overflowed by (\d+) bytes/.exec(m)?.[1];
    return { id: "too-big", title: `The program doesn't fit on ${board}`, text: `${over ? `It's ${Number(over).toLocaleString("en-US")} bytes too big. ` : ""}Shorten long text in Serial.print by wrapping it in F("…"), remove libraries you don't use, or choose a board with more memory.` };
  }
  const missing = /^undefined reference to `(setup|loop)(?:\(\))?'$/.exec(m);
  if (missing) return { id: "missing-setup-loop", title: `The sketch has no ${missing[1]}()`, text: "Every Arduino sketch needs both void setup() { } and void loop() { }, even if one is empty." };
  return null;
}

// ----- fixes -------------------------------------------------------------------------

/** Where a line's code ends, ignoring a trailing // comment and spaces (1-based column after the last code character). */
function codeEnd(text: string): number {
  let inString = false;
  let end = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== "\\") inString = !inString;
    if (!inString && c === "/" && text[i + 1] === "/") break;
    if (c !== " " && c !== "\t") end = i + 1;
  }
  return end + 1;
}

/**
 * A fix for the problem, when one is certain enough to offer (FIX-01). The
 * person always sees it before it's made, and it's one undo step.
 */
export function quickFix(diag: Diagnostic, source: string, all: Diagnostic[] = []): QuickFix | null {
  if (!diag.file) return null;
  const lines = source.split(/\r?\n/);
  const at = (n: number) => lines[n - 1] ?? "";
  const m = diag.message;

  if (/^expected (?:',' or )?';' before /.test(m)) {
    // GCC points at the token after the gap: the ; belongs at the end of the last code before it.
    let line = diag.line;
    const before = at(line).slice(0, diag.column - 1);
    if (!before.trim() || /^[)}\]]/.test(at(line).slice(diag.column - 1).trimStart()) && !before.trim()) {
      line--;
      while (line > 0 && !at(line).trim()) line--;
    }
    if (line <= 0) return null;
    const column = line === diag.line && before.trim() ? codeEnd(before) : codeEnd(at(line));
    return { title: "Add the missing ;", file: diag.file, edits: [{ line, column, length: 0, text: ";" }] };
  }

  const nd = NOT_DECLARED.exec(m);
  if (nd) {
    const right = likelyName(nd[1], diag);
    if (!right) return null;
    // The name starts at the column GCC gives; replace exactly it.
    if (at(diag.line).slice(diag.column - 1, diag.column - 1 + nd[1].length) !== nd[1]) return null;
    return { title: `Change ${nd[1]} to ${right}`, file: diag.file, edits: [{ line: diag.line, column: diag.column, length: nd[1].length, text: right }] };
  }

  if (/^missing terminating " character$/.test(m)) {
    const text = at(diag.line);
    const open = diag.column - 1;
    const rest = text.slice(open + 1);
    // Close the text before the call's ) or the ;, else at the end of the line.
    const stop = rest.search(/\)\s*;?\s*$|;\s*$/);
    const column = stop >= 0 ? open + 2 + stop : codeEnd(text);
    return { title: 'Add the closing "', file: diag.file, edits: [{ line: diag.line, column, length: 0, text: '"' }] };
  }

  if (/^a function-definition is not allowed here before '\{' token$/.test(m)) {
    // Close the function above just before this one starts.
    let line = diag.line - 1;
    while (line > 0 && !at(line).trim()) line--;
    return { title: "Close the function above with }", file: diag.file, edits: [{ line: line + 1, column: 1, length: 0, text: "}\n" }] };
  }

  if (/^expected '}' at end of input$/.test(m)) {
    // Fixed by the function-definition fix when there is one; else close at the end.
    if (all.some((d) => /^a function-definition is not allowed here/.test(d.message) && d.file === diag.file)) return null;
    const last = lines.length;
    return { title: "Add } at the end", file: diag.file, edits: [{ line: last, column: at(last).length + 1, length: 0, text: at(last).trim() ? "\n}" : "}" }] };
  }

  return null;
}

/** The text with the fix made, for the preview and for tests. */
export function applyEdits(source: string, edits: Edit[]): string {
  const crlf = source.includes("\r\n");
  const lines = source.split(/\r?\n/);
  // Last first, so earlier positions stay right.
  const ordered = [...edits].sort((a, b) => b.line - a.line || b.column - a.column);
  for (const e of ordered) {
    const i = e.line - 1;
    const text = lines[i] ?? "";
    const next = text.slice(0, e.column - 1) + e.text + text.slice(e.column - 1 + e.length);
    lines.splice(i, 1, ...next.split("\n"));
  }
  return lines.join(crlf ? "\r\n" : "\n");
}
