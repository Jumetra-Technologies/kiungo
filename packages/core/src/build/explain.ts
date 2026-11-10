import { NOT_DECLARED, likelyName, type Diagnostic, type Explanation } from "./diagnostics";

type Explainer = (m: string, diag: Diagnostic, board: string) => Explanation | null;

function missingSemicolon(m: string): Explanation | null {
  if (/^expected (?:',' or )?';' before /.test(m)) {
    return {
      id: "missing-semicolon",
      title: "A semicolon is missing",
      text: "Every instruction in Arduino code ends with a ;. The line before the one marked, or the end of the marked line, is missing one.",
    };
  }
  return null;
}

function semicolonAfterType(m: string): Explanation | null {
  const after = /^expected ';' after (class|struct|union|enum) definition$/.exec(m);
  if (after) {
    return {
      id: "missing-semicolon",
      title: `A ; is missing after the ${after[1]}`,
      text: `A ${after[1]} definition ends with }; — the semicolon after the closing brace is easy to forget.`,
    };
  }
  return null;
}

function notDeclared(m: string, diag: Diagnostic): Explanation | null {
  const nd = NOT_DECLARED.exec(m);
  if (nd) {
    const [, name = ""] = nd;
    const right = likelyName(name, diag);
    if (right && right.toLowerCase() === name.toLowerCase()) {
      return {
        id: "wrong-case",
        title: `${name} should be ${right}`,
        text: `Arduino code cares about capital letters, so ${name} and ${right} are different names. The one that exists is ${right}.`,
      };
    }
    if (right)
      return {
        id: "misspelled",
        title: `${name} isn't defined. Did you mean ${right}?`,
        text: `There's no ${name} in this sketch or its libraries. ${right} is close: check the spelling.`,
      };
    return {
      id: "not-declared",
      title: `${name} isn't defined`,
      text: `The code uses ${name}, but nothing creates it. Check the spelling and capital letters, or declare it before it's used${/pin/i.test(name) ? `, for example at the top of the sketch: const int ${name} = 13;` : "."}`,
    };
  }
  return null;
}

function missingHeader(m: string): Explanation | null {
  const header = /^([\w./+-]+\.h(?:pp)?): No such file or directory$/.exec(m);
  if (header) {
    return {
      id: "missing-library",
      title: `The library for ${header[1]} isn't in this sketch`,
      text: `${header[1]} comes from an Arduino library. Add the library to the sketch and build again: Kiungo downloads it the first time.`,
      header: header[1],
    };
  }
  return null;
}

function braceAtEnd(m: string): Explanation | null {
  if (/^expected '}' at end of input$/.test(m)) {
    return {
      id: "missing-brace",
      title: "A } is missing",
      text: "Something opened with { never closes. Each function, if and loop needs its own } at the end. Look just above the line marked.",
    };
  }
  return null;
}

function functionNotClosed(m: string): Explanation | null {
  if (/^a function-definition is not allowed here before '\{' token$/.test(m)) {
    return {
      id: "missing-brace",
      title: "The function above isn't closed",
      text: "The function before the one marked is missing its closing }, so this one looks like it's inside it. Add } where the function above ends.",
    };
  }
  return null;
}

function wrongArguments(m: string): Explanation | null {
  const args = /^too (few|many) arguments to function '(.+)'$/.exec(m);
  if (args) {
    const [, fewOrMany, called = ""] = args;
    const signature = called.replace(/^[\w\s*&:<>]*?\s+(?=[\w:]+\()/, "");
    const fn = /^([\w:]+)\(/.exec(signature)?.[1] ?? signature;
    const params = /\((.*)\)/.exec(signature)?.[1]?.trim() ?? "";
    const count = params && params !== "void" ? params.split(",").length : 0;
    return {
      id: "wrong-arguments",
      title: `${fn} needs ${fewOrMany === "few" ? "more" : "fewer"} values`,
      text: `${fn} takes ${count === 1 ? "1 value" : `${count} values`}, separated by commas: ${signature}.`,
    };
  }
  return null;
}

function unclosedText(m: string): Explanation | null {
  if (/^missing terminating " character$/.test(m)) {
    return {
      id: "unclosed-text",
      title: 'Some text is missing its closing "',
      text: 'Text in code starts and ends with a ". The marked line opens one and never closes it.',
    };
  }
  return null;
}

function definedTwice(m: string): Explanation | null {
  const redef = /^redefinition of '(.+)'$/.exec(m);
  if (redef) {
    const [, defined = ""] = redef;
    const name = /\b(\w+)\(/.exec(defined)?.[1] ?? defined;
    return {
      id: "defined-twice",
      title: `${name} is written twice`,
      text:
        name === "setup" || name === "loop"
          ? `A sketch has exactly one ${name}(). Move what's in the second one into the first, then delete the second.`
          : `There are two ${name}s. Rename one, or delete the copy.`,
    };
  }
  return null;
}

function tooBig(m: string, _diag: Diagnostic, board: string): Explanation | null {
  if (/overflowed by \d+ bytes|will not fit in region|^Sketch too big$/.test(m)) {
    const over = /overflowed by (\d+) bytes/.exec(m)?.[1];
    return {
      id: "too-big",
      title: `The program doesn't fit on ${board}`,
      text: `${over ? `It's ${Number(over).toLocaleString("en-US")} bytes too big. ` : ""}Shorten long text in Serial.print by wrapping it in F("…"), remove libraries you don't use, or choose a board with more memory.`,
    };
  }
  return null;
}

function missingSetupLoop(m: string): Explanation | null {
  const missing = /^undefined reference to `(setup|loop)(?:\(\))?'$/.exec(m);
  if (missing)
    return {
      id: "missing-setup-loop",
      title: `The sketch has no ${missing[1]}()`,
      text: "Every Arduino sketch needs both void setup() { } and void loop() { }, even if one is empty.",
    };
  return null;
}

/** In order: the first that recognizes the message explains it. */
const EXPLAINERS: Explainer[] = [
  missingSemicolon,
  semicolonAfterType,
  notDeclared,
  missingHeader,
  braceAtEnd,
  functionNotClosed,
  wrongArguments,
  unclosedText,
  definedTwice,
  tooBig,
  missingSetupLoop,
];

/** The catalog of common problems (ERR-02). Null for anything else: the compiler's own words are shown. */
export function explain(diag: Diagnostic, board = "the board"): Explanation | null {
  for (const explainer of EXPLAINERS) {
    const found = explainer(diag.message, diag, board);
    if (found) return found;
  }
  return null;
}
