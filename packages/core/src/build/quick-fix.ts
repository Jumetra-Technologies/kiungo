import { NOT_DECLARED, likelyName, type Diagnostic, type Edit, type QuickFix } from "./diagnostics";

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

/** What a fixer reads: the problem, its file's lines and the build's other problems. */
interface FixContext {
  diag: Diagnostic;
  m: string;
  file: string;
  lines: string[];
  at: (n: number) => string;
  all: Diagnostic[];
}

/** A fix for one kind of message: undefined when the message isn't its kind, null when it is but can't be fixed. */
type Fixer = (c: FixContext) => QuickFix | null | undefined;

function addSemicolon({ diag, m, at, file }: FixContext): QuickFix | null | undefined {
  if (/^expected (?:',' or )?';' before /.test(m)) {
    // GCC points at the token after the gap: the ; belongs at the end of the last code before it.
    let line = diag.line;
    const before = at(line).slice(0, diag.column - 1);
    if (
      !before.trim() ||
      (/^[)}\]]/.test(
        at(line)
          .slice(diag.column - 1)
          .trimStart(),
      ) &&
        !before.trim())
    ) {
      line--;
      while (line > 0 && !at(line).trim()) line--;
    }
    if (line <= 0) return null;
    const column = line === diag.line && before.trim() ? codeEnd(before) : codeEnd(at(line));
    return {
      title: "Add the missing ;",
      file,
      edits: [{ line, column, length: 0, text: ";" }],
    };
  }
  return undefined;
}

function fixName({ diag, m, at, file }: FixContext): QuickFix | null | undefined {
  const nd = NOT_DECLARED.exec(m);
  if (nd) {
    const [, name = ""] = nd;
    const right = likelyName(name, diag);
    if (!right) return null;
    // The name starts at the column GCC gives; replace exactly it.
    if (at(diag.line).slice(diag.column - 1, diag.column - 1 + name.length) !== name) return null;
    return {
      title: `Change ${name} to ${right}`,
      file,
      edits: [{ line: diag.line, column: diag.column, length: name.length, text: right }],
    };
  }
  return undefined;
}

function closeText({ diag, m, at, file }: FixContext): QuickFix | null | undefined {
  if (/^missing terminating " character$/.test(m)) {
    const text = at(diag.line);
    const open = diag.column - 1;
    const rest = text.slice(open + 1);
    // Close the text before the call's ) or the ;, else at the end of the line.
    const stop = rest.search(/\)\s*;?\s*$|;\s*$/);
    const column = stop >= 0 ? open + 2 + stop : codeEnd(text);
    return {
      title: 'Add the closing "',
      file,
      edits: [{ line: diag.line, column, length: 0, text: '"' }],
    };
  }
  return undefined;
}

function closeFunctionAbove({ diag, m, at, file }: FixContext): QuickFix | null | undefined {
  if (/^a function-definition is not allowed here before '\{' token$/.test(m)) {
    // Close the function above just before this one starts.
    let line = diag.line - 1;
    while (line > 0 && !at(line).trim()) line--;
    return {
      title: "Close the function above with }",
      file,
      edits: [{ line: line + 1, column: 1, length: 0, text: "}\n" }],
    };
  }
  return undefined;
}

function closeAtEnd({ diag, m, at, lines, all, file }: FixContext): QuickFix | null | undefined {
  if (/^expected '}' at end of input$/.test(m)) {
    // Fixed by the function-definition fix when there is one; else close at the end.
    if (
      all.some(
        (d) => /^a function-definition is not allowed here/.test(d.message) && d.file === diag.file,
      )
    )
      return null;
    const last = lines.length;
    return {
      title: "Add } at the end",
      file,
      edits: [
        { line: last, column: at(last).length + 1, length: 0, text: at(last).trim() ? "\n}" : "}" },
      ],
    };
  }
  return undefined;
}

const FIXERS: Fixer[] = [addSemicolon, fixName, closeText, closeFunctionAbove, closeAtEnd];

/**
 * A fix for the problem, when one is certain enough to offer (FIX-01). The
 * person always sees it before it's made, and it's one undo step.
 */
export function quickFix(
  diag: Diagnostic,
  source: string,
  all: Diagnostic[] = [],
): QuickFix | null {
  const file = diag.file;
  if (!file) return null;
  const lines = source.split(/\r?\n/);
  const at = (n: number) => lines[n - 1] ?? "";
  const m = diag.message;
  const c: FixContext = { diag, m, file, lines, at, all };
  for (const fixer of FIXERS) {
    const fix = fixer(c);
    if (fix !== undefined) return fix;
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
