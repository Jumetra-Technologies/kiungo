import { common } from "./checkers/common.mjs";
import { cpp } from "./checkers/cpp.mjs";
import { json } from "./checkers/json.mjs";
import { markdown } from "./checkers/markdown.mjs";
import { python } from "./checkers/python.mjs";
import { shell } from "./checkers/shell.mjs";
import { typescript } from "./checkers/typescript.mjs";
import { yaml } from "./checkers/yaml.mjs";

/**
 * One checker per language family. A checker has:
 *   id, label            name shown in reports
 *   appliesTo(file)      which files it owns
 *   lintText(file, text) fast static rules on the file contents (pure, unit-tested)
 *   runTools(ctx)        optional: real compilers, linters and test runners
 * To support a new language, add a checker here.
 */
export const checkers = [common, typescript, cpp, json, yaml, shell, markdown, python];

/** Runs every static rule that applies to one file. */
export function lintText(file, text, ctx = {}) {
  const out = [];
  for (const checker of checkers) {
    if (!checker.appliesTo(file) || !checker.lintText) continue;
    for (const f of checker.lintText(file, text, ctx)) out.push({ ...f, checker: checker.id });
  }
  return out;
}
