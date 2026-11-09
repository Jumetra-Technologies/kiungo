// Self-tests for the quality gate: every rule must flag bad code and accept good code.
// Run with: node --test scripts/qc/__tests__/lint.test.mjs scripts/qc/__tests__/parsers.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lintText } from "../registry.mjs";

const rules = (file, text, ctx = {}) => lintText(file, text, ctx).map((f) => f.rule);
const has = (file, text, rule, ctx) =>
  assert.ok(rules(file, text, ctx).includes(rule), `expected ${rule} in ${rules(file, text, ctx)}`);
const lacks = (file, text, rule, ctx) =>
  assert.ok(!rules(file, text, ctx).includes(rule), `unexpected ${rule}`);

// The marker words are assembled here so this file never trips the rule it tests.
const MARKERS = [
  "TO" + "DO",
  "FIX" + "ME",
  "HA" + "CK",
  "XX" + "X",
  "TB" + "D",
  "NOCOM" + "MIT",
  "to" + "do",
];

describe("unfinished-work marker rule (every language)", () => {
  const samples = {
    "src/a.ts": (m) => `const a = 1; // ${m}: later\n`,
    "apps/desktop/src/a.tsx": (m) => `/* ${m} */\nexport const a = 1;\n`,
    "src/a.mjs": (m) => `/**\n * ${m}\n */\nexport {};\n`,
    "fw/a.cpp": (m) => `int main() { return 0; }  // ${m}\n`,
    "fw/a.h": (m) => `#pragma once\n/* ${m} */\n`,
    "fw/a.c": (m) => `/*\n * line\n * ${m}\n */\nint x;\n`,
    "scripts/a.sh": (m) => `#!/usr/bin/env bash\nset -euo pipefail\n# ${m}\n`,
    ".github/workflows/a.yml": (m) => `name: x # ${m}\npermissions: {}\njobs: {}\n`,
    "tools/a.py": (m) => `x = 1  # ${m}\n`,
  };

  for (const [file, make] of Object.entries(samples)) {
    for (const marker of MARKERS) {
      it(`flags ${marker} in ${file}`, () => has(file, make(marker), "unfinished-work-marker"));
    }
  }

  it("reports the exact line of a marker inside a block comment", () => {
    const found = lintText("src/a.ts", `/*\n *\n * ${MARKERS[0]}\n */\n`).find(
      (f) => f.rule === "unfinished-work-marker",
    );
    assert.equal(found.line, 3);
  });

  it("flags a Python docstring marker", () => {
    has(
      "a.py",
      `def f():\n    """\n    ${MARKERS[0]}: finish\n    """\n    return 1\n`,
      "unfinished-work-marker",
    );
  });

  it("ignores the words inside string literals", () => {
    lacks(
      "src/a.ts",
      `const label = "${MARKERS[0]} list";\nconst t = \`${MARKERS[1]}\`;\n`,
      "unfinished-work-marker",
    );
    lacks("src/a.cpp", `const char* s = "${MARKERS[0]}";\n`, "unfinished-work-marker");
    lacks(
      "run.sh",
      `#!/usr/bin/env bash\nset -euo pipefail\necho "# ${MARKERS[0]}"\n`,
      "unfinished-work-marker",
    );
  });

  it("does not treat a dollar-hash expansion in shell as a comment", () => {
    lacks(
      "run.sh",
      `#!/usr/bin/env bash\nset -euo pipefail\necho $#${MARKERS[0]}\n`,
      "unfinished-work-marker",
    );
  });

  it("does not flag similar words inside identifiers or ordinary prose", () => {
    lacks(
      "src/a.ts",
      "// mastodon and hackathon are fine, so is autodoc\nexport const a = 1;\n",
      "unfinished-work-marker",
    );
  });

  it("is not applied to JSON or Markdown, which have no code comments", () => {
    lacks("a.md", `${MARKERS[0]} list\n`, "unfinished-work-marker");
    lacks("a.json", `{"note": "${MARKERS[0]}"}\n`, "unfinished-work-marker");
  });

  it("exempts the quality tooling itself", () => {
    lacks("scripts/qc/x.mjs", `// ${MARKERS[0]}\n`, "unfinished-work-marker");
  });
});

describe("common rules", () => {
  it("flags CRLF, a missing final newline and conflict markers", () => {
    has("a.txt", "a\r\nb\r\n", "line-endings");
    has("a.txt", "no newline", "final-newline");
    has("a.txt", "x\n<<<<<<< HEAD\ny\n", "merge-conflict-marker");
  });

  it("accepts an empty file", () => {
    assert.deepEqual(rules("a.txt", ""), []);
  });

  it("flags committed secrets of several kinds", () => {
    const fake = {
      key: "-----BEGIN " + "RSA PRIVATE KEY-----",
      aws: "AKIA" + "ABCDEFGHIJKLMNOP",
      gh: "ghp_" + "a".repeat(36),
      generic: 'const password = "' + "x".repeat(20) + '";',
    };
    for (const text of Object.values(fake)) has("a.ts", `${text}\n`, "secret");
  });

  it("does not flag ordinary assignments", () => {
    lacks("a.ts", 'const password = "";\nconst token = tokenFrom(request);\n', "secret");
  });
});

describe("typescript rules", () => {
  it("flags debugger, eval, console.log and suppressions", () => {
    has("src/a.ts", "debugger;\n", "no-debugger");
    has("src/a.ts", "eval('1');\n", "no-eval");
    has("src/a.ts", "console.log('x');\n", "no-console");
    has("src/a.ts", "// @ts-ignore\nconst a: number = 'x';\n", "ts-suppression");
    has("src/a.ts", "// @ts-expect-error\nconst a: number = 'x';\n", "ts-suppression");
    has("src/a.ts", "/* eslint-disable */\n", "eslint-suppression");
    has(
      "src/a.ts",
      "// eslint-disable-next-line no-console\nconsole.log(1);\n",
      "eslint-suppression",
    );
  });

  it("accepts documented suppressions and console.error", () => {
    lacks(
      "src/a.ts",
      "// @ts-expect-error legacy typing in vendor module\nconst a: number = 'x';\n",
      "ts-suppression",
    );
    lacks(
      "src/a.ts",
      "// eslint-disable-next-line no-console -- CLI banner\nconsole.error(1);\n",
      "eslint-suppression",
    );
    lacks("src/a.ts", "console.error('bad');\n", "no-console");
  });

  it("allows console output in scripts and tests", () => {
    lacks("scripts/x.mjs", "console.log('x');\n", "no-console");
    lacks("src/a.test.ts", "console.log('x');\n", "no-console");
  });

  it("ignores rule text that only appears in strings or comments", () => {
    lacks("src/a.ts", "const s = 'debugger eval(1)';\n// debugger\n", "no-debugger");
  });

  it("flags focused, skipped and pending tests only in test files", () => {
    for (const code of [
      "it.only('a', f);",
      "describe.skip('a', f);",
      "test.todo('a');",
      "xit('a', f);",
      "fit('a', f);",
    ]) {
      has("src/a.test.ts", `${code}\n`, "focused-or-skipped-test");
    }
    lacks("src/a.ts", "const x = it.only;\n", "focused-or-skipped-test");
  });

  it("enforces Electron security settings", () => {
    has(
      "apps/desktop/src/main/index.ts",
      "new BrowserWindow({ webPreferences: { nodeIntegration: true } });\n",
      "electron-node-integration",
    );
    has(
      "apps/desktop/src/main/index.ts",
      "const o = { contextIsolation: false };\n",
      "electron-context-isolation",
    );
    has("apps/desktop/src/main/index.ts", "const o = { sandbox: false };\n", "electron-sandbox");
    has(
      "apps/desktop/src/main/index.ts",
      "const o = { webSecurity: false };\n",
      "electron-web-security",
    );
    has("apps/desktop/src/main/index.ts", "new BrowserWindow({});\n", "electron-secure-window");
    lacks(
      "apps/desktop/src/main/index.ts",
      "new BrowserWindow({ webPreferences: { contextIsolation: true, nodeIntegration: false } });\n",
      "electron-secure-window",
    );
  });

  it("requires IPC channel constants and narrow preload APIs", () => {
    has("apps/desktop/src/main/ipc.ts", "ipcMain.handle('run:start', f);\n", "ipc-literal-channel");
    lacks(
      "apps/desktop/src/main/ipc.ts",
      "ipcMain.handle(IPC.runStart, f);\n",
      "ipc-literal-channel",
    );
    has(
      "apps/desktop/src/preload/index.ts",
      "contextBridge.exposeInMainWorld('api', ipcRenderer);\n",
      "preload-exposes-ipc",
    );
  });

  it("flags raw HTML injection and overlong files", () => {
    has(
      "apps/desktop/src/a.tsx",
      "const a = <div dangerouslySetInnerHTML={{ __html: x }} />;\n",
      "react-raw-html",
    );
    has("src/a.ts", "const a = 1;\n".repeat(600), "file-too-long");
  });
});

describe("c/c++ rules", () => {
  const shim = "firmware/shim/kiungo_shim.cpp";

  it("forbids heap use in the shim only", () => {
    for (const code of [
      "char* p = (char*)malloc(4);",
      "int* a = new int[4];",
      "delete a;",
      "std::vector<int> v;",
      "String s = x;",
    ]) {
      has(shim, `${code}\n`, "shim-no-heap");
    }
    lacks("firmware/bridge/b.cpp", "int* a = new int[4];\n", "shim-no-heap");
  });

  it("allows deleted functions and heap words inside comments and strings", () => {
    lacks(shim, "struct S { S(const S&) = delete; };\n", "shim-no-heap");
    lacks(shim, '// uses malloc(3) never\nconst char* s = "new thing";\n', "shim-no-heap");
  });

  it("requires header guards", () => {
    has("fw/a.h", "int f(void);\n", "header-guard");
    lacks("fw/a.h", "#pragma once\nint f(void);\n", "header-guard");
    lacks("fw/a.h", "#ifndef A_H\n#define A_H\nint f(void);\n#endif\n", "header-guard");
  });

  it("flags unbounded C string functions and using-namespace in headers", () => {
    has("fw/a.c", "void f(char* d, const char* s) { strcpy(d, s); }\n", "unsafe-c-function");
    has("fw/a.h", "#pragma once\nusing namespace std;\n", "using-namespace-header");
  });
});

describe("yaml rules", () => {
  const workflow = (body) => `name: CI\non: push\n${body}`;

  it("reports syntax errors and duplicate keys", () => {
    has("a.yml", "a: [1, 2\n", "yaml-syntax");
    has("a.yml", "a: 1\na: 2\n", "yaml-syntax");
  });

  it("requires least-privilege permissions and job timeouts in workflows", () => {
    const file = ".github/workflows/ci.yml";
    has(file, workflow("jobs:\n  a:\n    runs-on: x\n    steps: []\n"), "workflow-permissions");
    has(
      file,
      workflow("permissions: {}\njobs:\n  a:\n    runs-on: x\n    steps: []\n"),
      "workflow-timeout",
    );
    lacks(
      file,
      workflow(
        "permissions: {}\njobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n    steps: []\n",
      ),
      "workflow-timeout",
    );
  });

  it("requires pinned actions", () => {
    const file = ".github/workflows/ci.yml";
    const wf = (ref) =>
      workflow(
        `permissions: {}\njobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout${ref}\n`,
      );
    has(file, wf("@main"), "workflow-action-pin");
    has(file, wf(""), "workflow-action-pin");
    lacks(file, wf("@v4"), "workflow-action-pin");
  });
});

describe("shell rules", () => {
  it("requires a shebang and strict mode", () => {
    has("a.sh", "echo hi\n", "shell-shebang");
    has("a.sh", "#!/usr/bin/env bash\necho hi\n", "shell-strict-mode");
    lacks("a.sh", "#!/usr/bin/env bash\nset -euo pipefail\necho hi\n", "shell-strict-mode");
    lacks("a.sh", "#!/bin/sh\nset -eu\necho hi\n", "shell-strict-mode");
  });

  it("flags piping a download into a shell", () => {
    has(
      "a.sh",
      "#!/usr/bin/env bash\nset -euo pipefail\ncurl -s https://x.test/i | sh\n",
      "shell-pipe-to-shell",
    );
    lacks(
      "a.sh",
      "#!/usr/bin/env bash\nset -euo pipefail\n# curl https://x.test/i | sh\n",
      "shell-pipe-to-shell",
    );
  });
});

describe("markdown rules", () => {
  const ctx = { exists: (p) => ["docs/exists.md", "README.md"].includes(p) };

  it("flags broken relative links but accepts valid, external and anchor links", () => {
    has("README.md", "[x](docs/missing.md)\n", "broken-link", ctx);
    lacks(
      "README.md",
      "[x](docs/exists.md#top)\n[y](https://example.com)\n[z](#local)\n",
      "broken-link",
      ctx,
    );
    lacks("docs/a.md", "[up](../README.md)\n", "broken-link", ctx);
  });

  it("ignores links inside code", () => {
    lacks("README.md", "`[x](nope.md)`\n\n```\n[x](nope.md)\n```\n", "broken-link", ctx);
  });

  it("flags an unclosed code fence", () => {
    has("README.md", "```js\nconst a = 1;\n", "markdown-fence", ctx);
  });
});

describe("python rules", () => {
  it("flags bare except, eval and leftover debuggers", () => {
    has("a.py", "try:\n    f()\nexcept:\n    pass\n", "python-bare-except");
    has("a.py", "x = eval('1')\n", "python-eval");
    has("a.py", "breakpoint()\n", "python-debugger");
  });
});
