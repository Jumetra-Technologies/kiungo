import { SHELL_EXTENSIONS, extensionOf, scanHash } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";
import { run } from "../lib/run.mjs";
import { missingTool } from "../lib/tools.mjs";

// Shell scripts: syntax (bash -n), ShellCheck, and safety defaults.

export function lintShell(file, text) {
  const out = [];
  const lines = text.split("\n");
  const shebang = lines[0] ?? "";

  if (!/^#!\s*(?:\/usr\/bin\/env\s+(?:bash|sh)|\/bin\/(?:bash|sh))\b/.test(shebang)) {
    out.push(
      finding(
        "shell-shebang",
        file,
        1,
        "first line must be a shebang such as `#!/usr/bin/env bash`",
      ),
    );
  }

  const isBash = /bash/.test(shebang);
  const head = lines.slice(0, 25).join("\n");
  const strict = isBash
    ? /^\s*set\s+-[a-z]*e[a-z]*u[a-z]*o?\s*(?:pipefail)?|^\s*set\s+-euo\s+pipefail/m
    : /^\s*set\s+-[a-z]*e[a-z]*u|^\s*set\s+-eu/m;
  if (!strict.test(head)) {
    out.push(
      finding(
        "shell-strict-mode",
        file,
        1,
        `add \`${isBash ? "set -euo pipefail" : "set -eu"}\` near the top so failures stop the script`,
      ),
    );
  }

  const comments = new Set(scanHash(text).map((c) => c.line));
  lines.forEach((ln, i) => {
    if (comments.has(i + 1) && /^\s*#/.test(ln)) return;
    if (/\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/.test(ln)) {
      out.push(
        finding(
          "shell-pipe-to-shell",
          file,
          i + 1,
          "never pipe a download straight into a shell; download, verify, then run",
        ),
      );
    }
  });
  return out;
}

export const shell = {
  id: "shell",
  label: "Shell",
  appliesTo: (file) => SHELL_EXTENSIONS.includes(extensionOf(file)),
  lintText: lintShell,

  async runTools(ctx) {
    const out = [];
    for (const file of ctx.files) {
      const result = await run("bash", ["-n", file], { cwd: ctx.root });
      if (result.missing) return [missingTool(ctx, "bash", { required: true })];
      for (const ln of result.stderr.split("\n")) {
        const m = /line (\d+): (.*)$/.exec(ln);
        if (m) out.push(finding("shell-syntax", file, Number(m[1]), m[2]));
      }
    }
    if (ctx.files.length === 0) return out;
    const check = await run("shellcheck", ["-x", "-f", "gcc", ...ctx.files], { cwd: ctx.root });
    if (check.missing)
      return [...out, missingTool(ctx, "shellcheck", { hint: "apt install shellcheck" })];
    for (const ln of check.stdout.split("\n")) {
      const m = /^(.+?):(\d+):\d+: (error|warning): (.*)$/.exec(ln);
      if (m) out.push(finding("shellcheck", m[1], Number(m[2]), m[4]));
    }
    return out;
  },
};
