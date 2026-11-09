import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { config } from "../config.mjs";
import { C_EXTENSIONS, extensionOf, scanCStyle } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";
import { run, tail } from "../lib/run.mjs";
import { COMPILER_LINE, missingTool } from "../lib/tools.mjs";

// C / C++ firmware. The compiler is the syntax checker (warnings are errors), `nm` proves
// the shim only exports kg_ symbols (HWT-02), source rules enforce static allocation
// (HWT-05), and host-side tests in firmware/**/tests are compiled and executed.

const FW = config.firmware;
const isHeader = (file) => ["h", "hpp"].includes(extensionOf(file));
const isCpp = (file) => ["cc", "cpp", "cxx", "hpp"].includes(extensionOf(file));
const inShim = (file) => file.startsWith(FW.shimDir) && !file.includes("/tests/");

const HEAP_RULES = [
  { pattern: /\b(?:malloc|calloc|realloc|free|alloca|strdup)\s*\(/, what: "C heap allocation" },
  { pattern: /\bnew\b\s*(?:\(|[A-Za-z_])/, what: "operator new" },
  { pattern: /\bdelete\b(?!\s*;)/, what: "operator delete" },
  {
    pattern:
      /\bstd::(?:vector|string|map|unordered_map|list|deque|set|unique_ptr|shared_ptr|function)\b/,
    what: "a heap-backed standard container",
  },
  { pattern: /\bString\s+\w|\bString\s*\(/, what: "Arduino String (allocates on the heap)" },
];

export function lintCpp(file, text) {
  const out = [];
  const { code } = scanCStyle(text);

  if (
    isHeader(file) &&
    !/^\s*#\s*pragma\s+once\b/m.test(code) &&
    !/^\s*#\s*ifndef\s+\w+\s*\n\s*#\s*define\s+\w+/m.test(code)
  ) {
    out.push(finding("header-guard", file, 1, "header needs `#pragma once` or an include guard"));
  }

  code.split("\n").forEach((ln, i) => {
    if (/\bgets\s*\(|\bsprintf\s*\(|\bstrcpy\s*\(|\bstrcat\s*\(/.test(ln)) {
      out.push(
        finding(
          "unsafe-c-function",
          file,
          i + 1,
          "unbounded string function; use the n-variant (snprintf, strncpy...)",
        ),
      );
    }
    if (/\busing\s+namespace\s+std\s*;/.test(ln) && isHeader(file)) {
      out.push(
        finding(
          "using-namespace-header",
          file,
          i + 1,
          "`using namespace std` in a header leaks into every includer",
        ),
      );
    }
    if (inShim(file)) {
      for (const rule of HEAP_RULES) {
        if (rule.pattern.test(ln)) {
          out.push(
            finding(
              "shim-no-heap",
              file,
              i + 1,
              `the shim must use static storage only (HWT-05): found ${rule.what}`,
            ),
          );
        }
      }
    }
  });
  return out;
}

async function compileCheck(ctx, file) {
  const ext = extensionOf(file);
  if (ext === "ino") return []; // needs the Arduino core; the BLD pipeline builds these with arduino-cli
  const cpp = isCpp(file) || isHeader(file);
  const compiler = cpp ? "g++" : "gcc";
  const flags = cpp ? FW.cppFlags : FW.cFlags;
  const args = [...flags, "-fsyntax-only", "-I", dirname(file), "-I", FW.shimDir];
  // A header is compiled through a one-line translation unit that includes it, because
  // compilers warn about `#pragma once` when a header is the main file.
  const result = isHeader(file)
    ? await run(compiler, [...args, "-x", cpp ? "c++" : "c", "-"], {
        cwd: ctx.root,
        input: `#include "${join(ctx.root, file)}"\n`,
      })
    : await run(compiler, [...args, file], { cwd: ctx.root });
  if (result.missing) return [missingTool(ctx, compiler, { required: true })];
  const out = [];
  for (const ln of result.stderr.split("\n")) {
    const m = COMPILER_LINE.exec(ln);
    if (m) out.push(finding("compile", m[1], Number(m[2]), m[4].trim(), "error"));
  }
  if (result.code !== 0 && out.length === 0) out.push(finding("compile", file, 1, tail(result)));
  return out;
}

async function symbolCheck(ctx, file, tmp) {
  if (!inShim(file) || isHeader(file) || extensionOf(file) === "ino") return [];
  const object = join(tmp, `${file.replace(/\W/g, "_")}.o`);
  const compiler = isCpp(file) ? "g++" : "gcc";
  const flags = isCpp(file) ? FW.cppFlags : FW.cFlags;
  const built = await run(
    compiler,
    [
      ...flags,
      "-Os",
      "-ffunction-sections",
      "-fdata-sections",
      "-I",
      FW.shimDir,
      "-c",
      file,
      "-o",
      object,
    ],
    { cwd: ctx.root },
  );
  if (built.code !== 0) return []; // already reported by compileCheck
  const out = [];
  const nm = await run("nm", ["--defined-only", "--extern-only", object]);
  if (nm.missing) return [missingTool(ctx, "nm", { required: true, hint: "install binutils" })];
  for (const ln of nm.stdout.split("\n")) {
    const m = /^\S*\s+[A-Za-z]\s+(\S+)$/.exec(ln.trim());
    if (m && !FW.symbolPrefixes.some((p) => m[1].startsWith(p))) {
      out.push(
        finding(
          "shim-symbol-prefix",
          file,
          1,
          `exported symbol '${m[1]}' lacks the kg_ prefix (HWT-02); make it static or rename it`,
        ),
      );
    }
  }
  if (statSync(object).size > FW.maxShimObjectBytes) {
    out.push(
      finding(
        "shim-size",
        file,
        1,
        `object file is ${statSync(object).size} bytes, above the ${FW.maxShimObjectBytes} byte ceiling`,
      ),
    );
  }
  return out;
}

async function hostTests(ctx, files) {
  const tests = files.filter((f) => /^firmware\/.*\/tests\/.+_test\.(?:c|cc|cpp)$/.test(f));
  if (tests.length === 0) return [];
  const shimSources = files.filter((f) => inShim(f) && /\.(?:c|cc|cpp)$/.test(f));
  const out = [];
  for (const test of tests) {
    const tmp = mkdtempSync(join(tmpdir(), "kiungo-fw-"));
    try {
      const exe = join(tmp, "test");
      const cpp = /\.(?:cc|cpp)$/.test(test) || shimSources.some(isCpp);
      const built = await run(
        cpp ? "g++" : "gcc",
        [
          ...(cpp ? FW.cppFlags : FW.cFlags),
          "-I",
          FW.shimDir,
          "-I",
          dirname(test),
          test,
          ...shimSources,
          "-o",
          exe,
        ],
        { cwd: ctx.root },
      );
      if (built.code !== 0) {
        out.push(finding("firmware-test-build", test, 1, `test does not build:\n${tail(built)}`));
        continue;
      }
      const ran = await run(exe, [], { cwd: ctx.root, timeoutMs: 60_000 });
      if (ran.code !== 0)
        out.push(
          finding("firmware-test", test, 1, `host test failed (exit ${ran.code}):\n${tail(ran)}`),
        );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return out;
}

async function optionalTool(ctx, tool, args, parse, hint) {
  const result = await run(tool, args, { cwd: ctx.root });
  if (result.missing) return [missingTool(ctx, tool, { hint })];
  return parse(result);
}

export const cpp = {
  id: "cpp",
  label: "C / C++ firmware",
  appliesTo: (file) => C_EXTENSIONS.includes(extensionOf(file)),
  lintText: lintCpp,

  async runTools(ctx) {
    const sources = ctx.files;
    if (sources.length === 0) return [];
    const tmp = mkdtempSync(join(tmpdir(), "kiungo-fw-"));
    try {
      const out = [];
      for (const file of sources) {
        out.push(...(await compileCheck(ctx, file)));
        out.push(...(await symbolCheck(ctx, file, tmp)));
      }
      out.push(...(await hostTests(ctx, ctx.allFiles)));

      if (existsSync(join(ctx.root, ".clang-format"))) {
        out.push(
          ...(await optionalTool(
            ctx,
            "clang-format",
            ["--dry-run", "--Werror", ...sources],
            (r) =>
              r.stderr.split("\n").flatMap((ln) => {
                const m = COMPILER_LINE.exec(ln);
                return m ? [finding("format", m[1], Number(m[2]), m[4].trim())] : [];
              }),
            "apt install clang-format",
          )),
        );
      }

      out.push(
        ...(await optionalTool(
          ctx,
          "cppcheck",
          [
            "--enable=warning,style,performance,portability",
            "--inline-suppr",
            "--quiet",
            "--template={file}:{line}:{severity}:{id}:{message}",
            ...sources,
          ],
          (r) =>
            r.stderr.split("\n").flatMap((ln) => {
              const m =
                /^(.+?):(\d+):(error|warning|style|performance|portability):(\w+):(.*)$/.exec(ln);
              return m ? [finding(`cppcheck/${m[4]}`, m[1], Number(m[2]), m[5].trim())] : [];
            }),
          "apt install cppcheck",
        )),
      );
      return out;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
