import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Runs a program without a shell and collects its output.
 * Resolves (never rejects) with { code, stdout, stderr, missing, timedOut }.
 */
export function run(command, args, { cwd, timeoutMs = 300_000, input } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(command, args, { cwd, env: process.env, shell: process.platform === "win32" });
    } catch (error) {
      resolve({ code: null, stdout, stderr: String(error), missing: true, timedOut });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: null,
        stdout,
        stderr: stderr + String(error),
        missing: error.code === "ENOENT",
        timedOut,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, missing: false, timedOut });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Path to a binary installed by pnpm in the repository root. */
export function localBin(root, name) {
  const bin = join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
  return existsSync(bin) ? bin : null;
}

/** Last `count` non-empty lines of combined output, for error messages. */
export function tail(result, count = 15) {
  return `${result.stdout}\n${result.stderr}`
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-count)
    .join("\n");
}
