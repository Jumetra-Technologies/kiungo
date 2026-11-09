# Quality control gate

Nothing merges to `main` unless the **Quality gate** check is green. The gate is a single
command that runs language-specific checks over every file in the repository.

```bash
pnpm qc              # files changed against origin/main (default on your machine)
pnpm qc:all          # every file (what CI runs)
pnpm qc:selftest     # tests of the gate itself
```

Exit code `0` means fit to merge, `1` means errors were found, `2` means the gate itself broke.
Warnings never block a merge locally, but in CI `--strict-tools` turns a skipped check
(for example a missing `shellcheck`) into an error, so a check can never be silently skipped
on the machine that decides whether code is merged.

## Unfinished work is an error

Only production-ready code is merged, so a comment containing one of the markers below fails
the gate in every language that has comments (TypeScript, JavaScript, C, C++, Arduino, shell,
Python, YAML):

`TODO`, `FIXME`, `HACK`, `XXX`, `TBD`, `NOCOMMIT`

The scanner understands each language's comment syntax, so the words inside string literals are
ignored and the words inside block comments or docstrings are caught, with the exact line.
If work is genuinely planned, track it in the issue tracker, not in the code.
The list lives in `scripts/qc/config.mjs`.

## What is checked, per language

| Language                    | Syntax and types                                                                        | Logic and tests                                                                                                                                                                        | Language-specific rules                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript / JavaScript** | `tsc --noEmit` for every tsconfig, ESLint parse                                         | Vitest with coverage thresholds (90% lines, 85% branches); focused, skipped or pending tests fail; every module in `packages/core` and `packages/protocol` needs a sibling `*.test.ts` | ESLint: `eqeqeq`, `no-explicit-any`, complexity 15, depth 4, max 5 params, no console. Gate: no `debugger`, `eval`, `@ts-ignore`; `@ts-expect-error` and `eslint-disable` need a reason; Electron security (`nodeIntegration`, `contextIsolation`, `sandbox`, `webSecurity`, remote module, `ipcRenderer` exposure); IPC channels must be constants; files at most 500 lines |
| **C / C++ firmware**        | `g++`/`gcc -fsyntax-only` with `-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Werror` | Host tests in `firmware/**/tests/*_test.cpp` are compiled with the shim and run                                                                                                        | Shim must not use the heap (HWT-05); `nm` proves the shim exports only `kg_` symbols (HWT-02); header guards; no unbounded `strcpy`/`sprintf`; `clang-format`; `cppcheck`                                                                                                                                                                                                    |
| **JSON**                    | Strict parser with exact line numbers; duplicate keys                                   | `boards/*.json` and `parts/*.json` are validated against the Zod schemas by `definitions.test.ts`                                                                                      | `package.json` needs name and version, no `latest`/`*`/git dependencies, `@kiungo/*` must be `workspace:*`                                                                                                                                                                                                                                                                   |
| **YAML**                    | YAML parser, duplicate keys                                                             |                                                                                                                                                                                        | Workflows: top-level `permissions`, `timeout-minutes` on every job, actions pinned to a version                                                                                                                                                                                                                                                                              |
| **Shell**                   | `bash -n`, `shellcheck`                                                                 |                                                                                                                                                                                        | Shebang, `set -euo pipefail`, no `curl ... \| sh`                                                                                                                                                                                                                                                                                                                            |
| **Markdown**                | Unclosed code fences                                                                    |                                                                                                                                                                                        | Relative links must resolve                                                                                                                                                                                                                                                                                                                                                  |
| **Python**                  | Interpreter parser, `ruff`                                                              |                                                                                                                                                                                        | No bare `except`, `eval`/`exec`, leftover debuggers                                                                                                                                                                                                                                                                                                                          |
| **All files**               | Prettier formatting                                                                     |                                                                                                                                                                                        | LF endings, final newline, merge-conflict markers, committed secrets (private keys, cloud and GitHub tokens, hard-coded passwords), files over 1 MB                                                                                                                                                                                                                          |

## Tools the gate needs

| Tool                                             | Needed for                  | If missing                   |
| ------------------------------------------------ | --------------------------- | ---------------------------- |
| Node 20+, pnpm, `pnpm install`                   | TypeScript, Prettier, tests | error                        |
| `g++`, `gcc`, `nm` (binutils)                    | firmware                    | error                        |
| `clang-format`, `cppcheck`, `shellcheck`, `ruff` | extra checks                | warning locally, error in CI |

On Ubuntu: `sudo apt install cppcheck clang-format shellcheck` and `pip install ruff`.

## Adding a rule or a language

1. Open `scripts/qc/checkers/<language>.mjs`. Static rules go in `lintText`, external tools in
   `runTools`.
2. Add a test to `scripts/qc/__tests__/lint.test.mjs` with one example that must be flagged and
   one that must pass.
3. To support a new language, create a checker with `id`, `appliesTo`, `lintText` and
   optionally `runTools`, then register it in `scripts/qc/registry.mjs`.

Policy numbers (markers, coverage, size limits, compiler flags) are in `scripts/qc/config.mjs`;
coverage thresholds are in each package's `vitest.config.ts`.

## Limits worth knowing

- The gate proves the code compiles, is formatted, follows the rules above and passes its tests.
  It cannot prove the tests are the right tests. Reviewers still read the change.
- Arduino `.ino` files are not compiled by the gate because they need the Arduino core; the
  build pipeline does that with `arduino-cli`.
- Comment scanning is lexical. A regular expression literal containing quote characters in
  unusual ways can confuse it; in that case the safe outcome is a reported false positive
  that a reviewer can see.
