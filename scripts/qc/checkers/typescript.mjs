import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { config } from "../config.mjs";
import { JS_EXTENSIONS, extensionOf, scanCStyle } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";
import { localBin, run, tail } from "../lib/run.mjs";
import { missingTool } from "../lib/tools.mjs";

// TypeScript / JavaScript: syntax and types (tsc), lint (ESLint), unit tests with coverage
// (Vitest), plus project rules that are specific to this Electron application.

const isAppCode = (file) => file.startsWith("apps/") || file.startsWith("packages/");
const isTestFile = (file) =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes("/__tests__/");

const CODE_RULES = [
  { rule: "no-debugger", pattern: /\bdebugger\b/, message: "remove the debugger statement" },
  {
    rule: "no-eval",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
    message: "eval and new Function execute arbitrary code",
  },
  {
    rule: "focused-or-skipped-test",
    pattern:
      /\b(?:describe|it|test)\.(?:only|skip|todo|fails)\b|\b(?:fit|fdescribe|xit|xdescribe|xtest)\s*\(/,
    message: "focused, skipped or pending tests are not allowed; fix or delete the test",
    testsOnly: true,
  },
  {
    rule: "electron-node-integration",
    appOnly: true,
    pattern: /nodeIntegration\s*:\s*true/,
    message: "nodeIntegration must stay off (renderer is untrusted)",
  },
  {
    rule: "electron-context-isolation",
    appOnly: true,
    pattern: /contextIsolation\s*:\s*false/,
    message: "contextIsolation must stay on",
  },
  {
    rule: "electron-sandbox",
    appOnly: true,
    pattern: /\bsandbox\s*:\s*false/,
    message: "the renderer sandbox must stay on",
  },
  {
    rule: "electron-web-security",
    appOnly: true,
    pattern: /webSecurity\s*:\s*false|allowRunningInsecureContent\s*:\s*true/,
    message: "do not weaken web security",
  },
  {
    rule: "electron-remote",
    appOnly: true,
    pattern: /enableRemoteModule|require\(\s*["'`]@electron\/remote/,
    message: "the remote module bypasses the main/renderer boundary",
  },
  {
    rule: "react-raw-html",
    appOnly: true,
    pattern: /dangerouslySetInnerHTML/,
    message: "raw HTML injection is not allowed",
  },
  {
    rule: "ipc-literal-channel",
    appOnly: true,
    pattern: /\bipc(?:Main|Renderer)\.(?:handle|handleOnce|on|once|invoke|send)\(\s*["'`]/,
    message: "use a channel constant from @kiungo/protocol instead of a string literal",
  },
  {
    rule: "preload-exposes-ipc",
    appOnly: true,
    pattern: /exposeInMainWorld\([^,]+,\s*ipcRenderer\s*\)/,
    message: "never expose ipcRenderer itself; expose narrow functions",
  },
];

export function lintTypeScript(file, text) {
  const out = [];
  const { comments, code } = scanCStyle(text, { templates: true });
  const lines = code.split("\n");
  const inTest = isTestFile(file);

  lines.forEach((ln, i) => {
    for (const r of CODE_RULES) {
      if (r.testsOnly && !inTest) continue;
      if (r.appOnly && !isAppCode(file)) continue;
      if (r.pattern.test(ln)) out.push(finding(r.rule, file, i + 1, r.message));
    }
    const consoleAllowed = inTest || config.consoleAllowedPaths.some((p) => file.startsWith(p));
    if (!consoleAllowed && /\bconsole\.(?:log|debug|info|trace)\b/.test(ln)) {
      out.push(
        finding(
          "no-console",
          file,
          i + 1,
          "remove console output; use console.warn/error for real problems",
        ),
      );
    }
  });

  if (isAppCode(file) && /new\s+BrowserWindow\s*\(/.test(code)) {
    for (const [name, pattern] of [
      ["contextIsolation: true", /contextIsolation\s*:\s*true/],
      ["nodeIntegration: false", /nodeIntegration\s*:\s*false/],
    ]) {
      if (!pattern.test(code)) {
        out.push(
          finding("electron-secure-window", file, 1, `BrowserWindow must set ${name} explicitly`),
        );
      }
    }
  }

  for (const c of comments) {
    if (/@ts-(?:ignore|nocheck)\b/.test(c.text)) {
      out.push(
        finding(
          "ts-suppression",
          file,
          c.line,
          "@ts-ignore/@ts-nocheck hide real errors; use @ts-expect-error with a reason",
        ),
      );
    }
    const expect = /@ts-expect-error\s*(.*)$/.exec(c.text);
    if (expect && expect[1].trim().length < 8) {
      out.push(
        finding(
          "ts-suppression",
          file,
          c.line,
          "@ts-expect-error needs a description of at least 8 characters",
        ),
      );
    }
    const disable = /eslint-disable(-next-line|-line)?\b(.*)$/.exec(c.text);
    if (disable) {
      if (!disable[1]) {
        out.push(
          finding(
            "eslint-suppression",
            file,
            c.line,
            "file-wide eslint-disable is not allowed; use eslint-disable-next-line",
          ),
        );
      } else if (!/\s--\s+\S.{4,}/.test(disable[2])) {
        out.push(
          finding(
            "eslint-suppression",
            file,
            c.line,
            "eslint-disable needs a reason: `// eslint-disable-next-line rule -- why`",
          ),
        );
      }
    }
  }

  const lineCount = text.split("\n").length;
  if (lineCount > config.maxSourceLines) {
    out.push(
      finding(
        "file-too-long",
        file,
        1,
        `${lineCount} lines; split the file (limit ${config.maxSourceLines})`,
      ),
    );
  }
  return out;
}

/** Every source module in the configured packages needs a sibling test file. */
export function missingTests(allFiles) {
  const out = [];
  const set = new Set(allFiles);
  for (const dir of config.testsRequiredIn) {
    for (const file of allFiles) {
      if (!file.startsWith(`${dir}/`) || !/\.[cm]?tsx?$/.test(file) || isTestFile(file)) continue;
      const name = file.split("/").pop();
      if (config.testsNotRequiredFor.includes(name)) continue;
      const test = file.replace(/\.[cm]?tsx?$/, ".test.ts");
      if (!set.has(test)) out.push(finding("missing-test", file, 1, `no test file; add ${test}`));
    }
  }
  return out;
}

async function typeCheck(ctx, tsconfigs) {
  const bin = localBin(ctx.root, "tsc");
  if (!bin) return [missingTool(ctx, "tsc", { required: true, hint: "run pnpm install" })];
  const out = [];
  for (const project of tsconfigs) {
    const result = await run(bin, ["--noEmit", "--pretty", "false", "-p", project], {
      cwd: ctx.root,
    });
    let matched = false;
    for (const ln of result.stdout.split("\n")) {
      const m = /^(.+?)\((\d+),\d+\): (error|warning) (TS\d+): (.*)$/.exec(ln);
      if (m) {
        matched = true;
        out.push(finding(m[4], m[1], Number(m[2]), m[5], m[3]));
      }
    }
    if (result.code !== 0 && !matched) {
      out.push(finding("tsc", project, 1, `type check failed:\n${tail(result)}`));
    }
  }
  return out;
}

async function lint(ctx) {
  const bin = localBin(ctx.root, "eslint");
  if (!bin) return [missingTool(ctx, "eslint", { required: true, hint: "run pnpm install" })];
  const result = await run(
    bin,
    [".", "--format", "json", "--report-unused-disable-directives", "--no-warn-ignored"],
    { cwd: ctx.root },
  );
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return [finding("eslint", "(project)", 1, `ESLint did not produce a report:\n${tail(result)}`)];
  }
  const out = [];
  for (const file of report) {
    for (const m of file.messages) {
      // Warnings count as errors: production-ready code has neither.
      out.push(
        finding(m.ruleId ?? "parse-error", relative(ctx.root, file.filePath), m.line, m.message),
      );
    }
  }
  return out;
}

async function unitTests(ctx, configs) {
  const out = [];
  for (const configFile of configs) {
    const dir = join(ctx.root, dirname(configFile));
    const label = dirname(configFile);
    const bin = localBin(dir, "vitest");
    if (!bin) {
      out.push(
        missingTool(ctx, "vitest", {
          required: true,
          hint: `run pnpm install (needed by ${label})`,
        }),
      );
      continue;
    }
    const work = mkdtempSync(join(tmpdir(), "kiungo-qc-"));
    const reportFile = join(work, "report.json");
    const result = await run(
      bin,
      ["run", "--coverage", "--reporter=json", `--outputFile=${reportFile}`],
      { cwd: dir },
    );
    try {
      out.push(...readVitestReport(ctx, label, reportFile, result));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return out;
}

function readVitestReport(ctx, label, reportFile, result) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportFile, "utf8"));
  } catch {
    return [finding("unit-tests", label, 1, `tests did not run:\n${tail(result)}`)];
  }
  const out = [];
  for (const suite of report.testResults) {
    const file = relative(ctx.root, suite.name);
    if (suite.status === "failed" && suite.assertionResults.length === 0) {
      out.push(
        finding("unit-tests", file, 1, `test file failed to load: ${suite.message || "see log"}`),
      );
    }
    for (const t of suite.assertionResults) {
      if (t.status === "failed") {
        out.push(
          finding(
            "unit-tests",
            file,
            t.location?.line ?? 1,
            `${t.fullName}: ${(t.failureMessages[0] ?? "").split("\n")[0]}`,
          ),
        );
      } else if (t.status !== "passed") {
        out.push(
          finding(
            "skipped-test",
            file,
            t.location?.line ?? 1,
            `${t.fullName} is ${t.status}; skipped tests are not allowed`,
          ),
        );
      }
    }
  }
  if (report.numTotalTests === 0) out.push(finding("unit-tests", label, 1, "no tests were found"));
  for (const ln of `${result.stdout}\n${result.stderr}`.split("\n")) {
    if (/does not meet .*threshold/i.test(ln))
      out.push(finding("coverage", label, 1, ln.replace(/^ERROR:\s*/, "").trim()));
  }
  return out;
}

export const typescript = {
  id: "typescript",
  label: "TypeScript / JavaScript",
  appliesTo: (file) => JS_EXTENSIONS.includes(extensionOf(file)),
  lintText: lintTypeScript,

  async runTools(ctx) {
    const out = missingTests(ctx.allFiles);
    const tsconfigs = ctx.allFiles.filter(
      (f) => /(^|\/)tsconfig(\.[\w-]+)?\.json$/.test(f) && !f.endsWith("tsconfig.base.json"),
    );
    const vitestConfigs = ctx.allFiles.filter((f) => /(^|\/)vitest\.config\.[cm]?[jt]s$/.test(f));
    const [types, lints, tests] = await Promise.all([
      typeCheck(ctx, tsconfigs),
      lint(ctx),
      ctx.options.skipTests ? [] : unitTests(ctx, vitestConfigs),
    ]);
    return [...out, ...types, ...lints, ...tests];
  },
};
