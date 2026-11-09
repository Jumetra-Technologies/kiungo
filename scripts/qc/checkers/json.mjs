import { extensionOf } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";

// JSON: strict syntax with exact line numbers, duplicate keys (which JSON.parse silently
// accepts and which hide mistakes), and package.json hygiene.

class JsonSyntaxError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

const ESCAPES = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/** Parses JSON strictly. Reports duplicate keys through `onDuplicate(key, line)`. */
export function parseJson(text, { allowComments = false, onDuplicate = () => {} } = {}) {
  let i = 0;
  let line = 1;
  const fail = (message) => {
    throw new JsonSyntaxError(message, line);
  };
  const describe = () => (i >= text.length ? "end of file" : `'${text[i]}'`);

  function skip() {
    for (;;) {
      const c = text[i];
      if (c === "\n") {
        line++;
        i++;
      } else if (c === " " || c === "\t" || c === "\r") {
        i++;
      } else if (allowComments && c === "/" && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
      } else if (allowComments && c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end === -1) fail("unterminated comment");
        line += (text.slice(i, end).match(/\n/g) ?? []).length;
        i = end + 2;
      } else {
        return;
      }
    }
  }

  function string() {
    i++;
    let result = "";
    for (;;) {
      const c = text[i];
      if (c === undefined) fail("unterminated string");
      if (c === '"') {
        i++;
        return result;
      }
      if (c === "\n") fail("newline inside a string");
      if (c === "\\") {
        const e = text[i + 1];
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
          result += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== undefined && e in ESCAPES) {
          result += ESCAPES[e];
          i += 2;
        } else {
          fail("invalid escape sequence");
        }
      } else if (c < " ") {
        fail("control character inside a string");
      } else {
        result += c;
        i++;
      }
    }
  }

  function number() {
    const re = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) fail(`invalid number near ${describe()}`);
    i += m[0].length;
    return Number(m[0]);
  }

  function object() {
    const result = {};
    i++;
    skip();
    if (text[i] === "}") {
      i++;
      return result;
    }
    for (;;) {
      skip();
      if (text[i] !== '"') fail(`expected a quoted key but found ${describe()}`);
      const keyLine = line;
      const key = string();
      skip();
      if (text[i] !== ":") fail(`expected ':' but found ${describe()}`);
      i++;
      if (Object.prototype.hasOwnProperty.call(result, key)) onDuplicate(key, keyLine);
      result[key] = value();
      skip();
      if (text[i] === ",") i++;
      else if (text[i] === "}") {
        i++;
        return result;
      } else fail(`expected ',' or '}' but found ${describe()}`);
    }
  }

  function array() {
    const result = [];
    i++;
    skip();
    if (text[i] === "]") {
      i++;
      return result;
    }
    for (;;) {
      result.push(value());
      skip();
      if (text[i] === ",") i++;
      else if (text[i] === "]") {
        i++;
        return result;
      } else fail(`expected ',' or ']' but found ${describe()}`);
    }
  }

  function value() {
    skip();
    const c = text[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"') return string();
    for (const [word, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ]) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    if (c === "-" || (c >= "0" && c <= "9")) return number();
    return fail(`unexpected ${describe()}`);
  }

  skip();
  if (i >= text.length) fail("file is empty");
  const result = value();
  skip();
  if (i < text.length) fail(`unexpected ${describe()} after the JSON value`);
  return result;
}

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function checkPackageJson(file, data) {
  const out = [];
  for (const key of ["name", "version"]) {
    if (typeof data[key] !== "string" || data[key] === "") {
      out.push(finding("package-json", file, 1, `package.json is missing "${key}"`));
    }
  }
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, version] of Object.entries(data[section] ?? {})) {
      if (name.startsWith("@kiungo/") && version !== "workspace:*") {
        out.push(
          finding(
            "dependency-version",
            file,
            1,
            `${name} must use "workspace:*", found "${version}"`,
          ),
        );
      } else if (
        typeof version !== "string" ||
        /^(?:\*|latest|next|)$/.test(version) ||
        /^(?:git|github:|https?:)/.test(version)
      ) {
        out.push(
          finding(
            "dependency-version",
            file,
            1,
            `${section}.${name} has an unpinned or remote version "${version}"`,
          ),
        );
      }
    }
  }
  return out;
}

export function lintJson(file, text) {
  const out = [];
  const allowComments = /(^|\/)(?:ts|js)config(\.[\w-]+)?\.json$/.test(file);
  let data;
  try {
    data = parseJson(text, {
      allowComments,
      onDuplicate: (key, line) =>
        out.push(
          finding(
            "json-duplicate-key",
            file,
            line,
            `duplicate key "${key}"; the last one silently wins`,
          ),
        ),
    });
  } catch (error) {
    if (!(error instanceof JsonSyntaxError)) throw error;
    return [finding("json-syntax", file, error.line, error.message)];
  }
  if (file.split("/").pop() === "package.json" && data && typeof data === "object") {
    out.push(...checkPackageJson(file, data));
  }
  return out;
}

export const json = {
  id: "json",
  label: "JSON",
  appliesTo: (file) => extensionOf(file) === "json",
  lintText: lintJson,
};
