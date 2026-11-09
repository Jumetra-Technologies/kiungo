#!/usr/bin/env node
// Kiungo quality gate. Exit code 0 only when the code is fit to merge.
// Run `node scripts/qc/qc.mjs --help` for options.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { allFiles, changedFiles, fileSize } from "./lib/files.mjs";
import {
  finding,
  formatFinding,
  renderMarkdownSummary,
  renderText,
  summarise,
} from "./lib/report.mjs";
import { checkers, lintText } from "./registry.mjs";

const HELP = `Usage: node scripts/qc/qc.mjs [options]

Scope
  --all               check every file (default in CI)
  --changed[=BASE]    check files changed against BASE (default origin/main, default locally)
  --only a,b          run only these checkers: ${checkers.map((c) => c.id).join(", ")}

Behaviour
  --skip-tools        static rules only (no compilers, linters or tests)
  --skip-tests        do not run unit tests
  --strict-tools      a missing optional tool (shellcheck, cppcheck...) is an error
  --format FORMAT     text (default), github (annotations) or json
  --out FILE          also write the full JSON report to FILE
  -h, --help          show this help

Exit codes: 0 pass, 1 findings with severity error, 2 the gate itself failed.`;

export function parseArgs(argv) {
  const o = {
    all: false,
    changed: false,
    base: "origin/main",
    only: null,
    skipTools: false,
    skipTests: false,
    strictTools: false,
    format: "text",
    out: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "--all") o.all = true;
    else if (a === "--changed") o.changed = true;
    else if (a.startsWith("--changed=")) {
      o.changed = true;
      o.base = a.slice(10);
    } else if (a === "--only") o.only = argv[++i]?.split(",") ?? [];
    else if (a === "--skip-tools") o.skipTools = true;
    else if (a === "--skip-tests") o.skipTests = true;
    else if (a === "--strict-tools") o.strictTools = true;
    else if (a === "--format") o.format = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!["text", "github", "json"].includes(o.format)) throw new Error(`unknown format ${o.format}`);
  if (o.only) {
    const ids = checkers.map((c) => c.id);
    const bad = o.only.filter((id) => !ids.includes(id));
    if (bad.length) throw new Error(`unknown checker(s): ${bad.join(", ")}`);
  }
  return o;
}

function readText(root, file) {
  const buffer = readFileSync(join(root, file));
  return buffer.includes(0) ? null : buffer.toString("utf8"); // null = binary
}

function staticPhase(root, files, checkerIds) {
  const out = [];
  for (const file of files) {
    if (fileSize(root, file) > config.maxFileBytes) {
      out.push({
        ...finding("file-too-large", file, 1, `file is larger than ${config.maxFileBytes} bytes`),
        checker: "common",
      });
      continue;
    }
    const text = readText(root, file);
    if (text === null) continue;
    out.push(...lintText(file, text, { root }).filter((f) => checkerIds.has(f.checker)));
  }
  return out;
}

async function toolPhase(root, files, everything, options, checkerIds) {
  const jobs = checkers
    .filter((c) => c.runTools && checkerIds.has(c.id))
    .map(async (checker) => {
      const mine = files.filter((f) => checker.appliesTo(f));
      const ctx = {
        root,
        files: mine,
        allFiles: everything,
        allMode: mine.length === everything.length,
        options,
      };
      try {
        const found = await checker.runTools(ctx);
        return found.map((f) => ({ ...f, checker: checker.id }));
      } catch (error) {
        return [
          {
            ...finding(
              "gate-crash",
              "(qc)",
              1,
              `${checker.id} tools crashed: ${error.stack ?? error}`,
            ),
            checker: checker.id,
          },
        ];
      }
    });
  return (await Promise.all(jobs)).flat();
}

export async function main(argv, root) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const started = Date.now();
  const everything = allFiles(root);
  let files = everything;
  let scope = "all files";
  const wantChanged = options.changed || (!options.all && !process.env.CI);
  if (wantChanged) {
    const changed = changedFiles(root, options.base);
    if (changed) {
      files = changed;
      scope = `${changed.length} changed file(s) against ${options.base}`;
    }
  }
  const ids = new Set(options.only ?? checkers.map((c) => c.id));
  ids.add("common"); // universal rules (secrets, markers, formatting) always apply

  let findings = staticPhase(root, files, ids);
  if (!options.skipTools)
    findings.push(...(await toolPhase(root, files, everything, options, ids)));

  const seen = new Set();
  findings = findings.filter((f) => {
    const key = `${f.rule}|${f.file}|${f.line}|${f.message}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const { errors, warnings, byChecker } = summarise(findings);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify({ scope, errors, warnings, findings }, null, 2)}\n`);
  } else if (options.format === "github") {
    for (const f of findings) process.stdout.write(`${formatFinding(f, "github")}\n`);
  } else if (findings.length > 0) {
    process.stdout.write(`${renderText(findings, process.stdout.isTTY)}\n\n`);
  }
  const verdict = errors === 0 ? "PASSED" : "FAILED";
  process.stderr.write(
    `Quality gate ${verdict}: ${errors} error(s), ${warnings} warning(s), ${files.length} file(s) in scope [${scope}] in ${seconds}s\n`,
  );
  if (errors > 0) {
    const parts = [...byChecker]
      .filter(([, v]) => v.errors > 0)
      .map(([k, v]) => `${k}: ${v.errors}`);
    process.stderr.write(`Errors by language: ${parts.join(", ")}\n`);
  }

  if (options.out)
    writeFileSync(
      options.out,
      `${JSON.stringify({ scope, errors, warnings, findings }, null, 2)}\n`,
    );
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      renderMarkdownSummary(findings, { scope, checkers: [...ids] }),
    );
  }
  return errors > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  main(process.argv.slice(2), root).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`qc: ${error.message}\n`);
      process.exit(2);
    },
  );
}
