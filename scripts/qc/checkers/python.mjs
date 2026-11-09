import { PYTHON_EXTENSIONS, extensionOf, scanHash } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";
import { run } from "../lib/run.mjs";
import { missingTool } from "../lib/tools.mjs";

// Python (MicroPython support code, tooling). Syntax comes from the interpreter's own parser,
// style and bug patterns from Ruff.

const PARSE_SCRIPT = [
  "import ast, sys",
  "path = sys.argv[1]",
  "try:",
  "    ast.parse(open(path, encoding='utf-8').read(), path)",
  "except SyntaxError as e:",
  "    print(f'{e.lineno or 1}:{e.msg}')",
  "    sys.exit(1)",
].join("\n");

export function lintPython(file, text) {
  const out = [];
  const docstringLines = new Set(scanHash(text, { triple: true }).map((c) => c.line));
  text.split("\n").forEach((ln, i) => {
    if (docstringLines.has(i + 1)) return;
    if (/^\s*except\s*:/.test(ln))
      out.push(
        finding(
          "python-bare-except",
          file,
          i + 1,
          "bare `except:` hides real errors; catch a specific exception",
        ),
      );
    if (/\b(?:eval|exec)\s*\(/.test(ln))
      out.push(finding("python-eval", file, i + 1, "eval/exec run arbitrary code"));
    if (/\bbreakpoint\s*\(|\bimport\s+pdb\b/.test(ln))
      out.push(finding("python-debugger", file, i + 1, "remove the debugger"));
  });
  return out;
}

export const python = {
  id: "python",
  label: "Python",
  appliesTo: (file) => PYTHON_EXTENSIONS.includes(extensionOf(file)),
  lintText: lintPython,

  async runTools(ctx) {
    if (ctx.files.length === 0) return [];
    const out = [];
    for (const file of ctx.files) {
      const result = await run("python3", ["-I", "-c", PARSE_SCRIPT, file], { cwd: ctx.root });
      if (result.missing) return [missingTool(ctx, "python3", { required: true })];
      const m = /^(\d+):(.*)$/m.exec(result.stdout);
      if (result.code !== 0 && m) out.push(finding("python-syntax", file, Number(m[1]), m[2]));
    }
    const ruff = await run(
      "ruff",
      ["check", "--no-cache", "--output-format", "concise", ...ctx.files],
      { cwd: ctx.root },
    );
    if (ruff.missing) return [...out, missingTool(ctx, "ruff", { hint: "pip install ruff" })];
    for (const ln of ruff.stdout.split("\n")) {
      const m = /^(.+?):(\d+):\d+: (\S+) (.*)$/.exec(ln);
      if (m) out.push(finding(`ruff/${m[3]}`, m[1], Number(m[2]), m[4]));
    }
    return out;
  },
};
