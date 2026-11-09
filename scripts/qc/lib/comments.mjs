// Language-aware comment extraction. Each language family has its own comment syntax and its
// own string rules, so a plain text search for the marker words would give false positives
// (inside strings) and false negatives (inside block comments).

const blank = (s) => s.replace(/[^\n]/g, " ");
const countNewlines = (s) => (s.match(/\n/g) ?? []).length;

/**
 * Scans C-family source (C, C++, TypeScript, JavaScript).
 * Returns the comments (one entry per line) and a copy of the source in which comments and
 * string contents are replaced by spaces, so regex rules only ever see real code.
 */
export function scanCStyle(text, { templates = false } = {}) {
  const comments = [];
  let code = "";
  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === "/" && d === "/") {
      let end = text.indexOf("\n", i);
      if (end === -1) end = n;
      comments.push({ line, text: text.slice(i + 2, end) });
      code += " ".repeat(end - i);
      i = end;
    } else if (c === "/" && d === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      const raw = text.slice(i, end);
      raw.split("\n").forEach((part, k) => comments.push({ line: line + k, text: part }));
      code += blank(raw);
      line += countNewlines(raw);
      i = end;
    } else if (c === '"' || c === "'" || (templates && c === "`")) {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === "\n" && c !== "`") break;
        j++;
      }
      const end = j < n && text[j] === c ? j + 1 : Math.min(j, n);
      const raw = text.slice(i, end);
      code += raw.length >= 2 && raw.endsWith(c) ? c + blank(raw.slice(1, -1)) + c : blank(raw);
      line += countNewlines(raw);
      i = end;
    } else {
      if (c === "\n") line++;
      code += c;
      i++;
    }
  }
  return { comments, code };
}

/**
 * Scans hash-comment languages (shell, YAML, Python). A '#' starts a comment only at the start
 * of a line or after whitespace and outside quotes, so `$#` and `"#"` are not comments.
 * With `triple` set, Python triple-quoted strings (docstrings) count as comments.
 */
export function scanHash(text, { triple = false } = {}) {
  const comments = [];
  let openTriple = null;
  text.split("\n").forEach((ln, index) => {
    const lineNo = index + 1;
    if (openTriple) {
      comments.push({ line: lineNo, text: ln });
      if (ln.includes(openTriple)) openTriple = null;
      return;
    }
    let quote = null;
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i];
      if (quote) {
        if (ch === "\\" && quote === '"') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (triple && (ln.startsWith('"""', i) || ln.startsWith("'''", i))) {
        const mark = ln.slice(i, i + 3);
        const rest = ln.slice(i + 3);
        comments.push({ line: lineNo, text: rest });
        if (!rest.includes(mark)) openTriple = mark;
        break;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "#" && (i === 0 || /\s/.test(ln[i - 1]))) {
        comments.push({ line: lineNo, text: ln.slice(i + 1) });
        break;
      }
    }
  });
  return comments;
}

export const extensionOf = (file) => {
  const name = file.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
};

export const JS_EXTENSIONS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
export const C_EXTENSIONS = ["c", "h", "cc", "cpp", "cxx", "hpp", "ino"];
export const SHELL_EXTENSIONS = ["sh", "bash"];
export const PYTHON_EXTENSIONS = ["py"];
export const YAML_EXTENSIONS = ["yml", "yaml"];

/** Comments of a file, or null when the file type has no code comments (JSON, Markdown...). */
export function extractComments(file, text) {
  const ext = extensionOf(file);
  if (JS_EXTENSIONS.includes(ext)) return scanCStyle(text, { templates: true }).comments;
  if (C_EXTENSIONS.includes(ext)) return scanCStyle(text).comments;
  if (PYTHON_EXTENSIONS.includes(ext)) return scanHash(text, { triple: true });
  if (SHELL_EXTENSIONS.includes(ext) || YAML_EXTENSIONS.includes(ext)) return scanHash(text);
  return null;
}
