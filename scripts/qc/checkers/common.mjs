import { config } from "../config.mjs";
import { extractComments } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";
import { localBin, run } from "../lib/run.mjs";
import { missingTool } from "../lib/tools.mjs";

// Rules that apply to every text file regardless of language.

const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/\bsk-[A-Za-z0-9]{32,}\b/, "API secret key"],
  [
    /(?:api[_-]?key|secret|token|passwd|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/i,
    "hard-coded credential",
  ],
];

const PRETTIER_EXTENSIONS = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|css|html)$/;

function markerFindings(file, text) {
  if (config.markerExemptPaths.some((p) => file.startsWith(p))) return [];
  const comments = extractComments(file, text);
  if (!comments) return [];
  const out = [];
  for (const comment of comments) {
    const match = config.markers.exec(comment.text);
    if (match) {
      out.push(
        finding(
          "unfinished-work-marker",
          file,
          comment.line,
          `'${match[0]}' comment: finish the work or remove it. Only production-ready code can be merged.`,
        ),
      );
    }
  }
  return out;
}

export const common = {
  id: "common",
  label: "All files",
  appliesTo: () => true,

  lintText(file, text) {
    const out = [];
    const lines = text.split("\n");

    if (text.includes("\r\n")) {
      out.push(
        finding(
          "line-endings",
          file,
          1,
          "CRLF line endings found; the repository uses LF (see .editorconfig)",
        ),
      );
    }
    if (text.length > 0 && !text.endsWith("\n")) {
      out.push(finding("final-newline", file, lines.length, "file does not end with a newline"));
    }

    lines.forEach((ln, i) => {
      if (/^(?:<{7}|>{7})(?: |$)/.test(ln)) {
        out.push(finding("merge-conflict-marker", file, i + 1, "unresolved merge conflict marker"));
      }
      for (const [pattern, name] of SECRET_PATTERNS) {
        if (pattern.test(ln)) {
          out.push(finding("secret", file, i + 1, `possible ${name} committed to the repository`));
          break;
        }
      }
    });

    return [...out, ...markerFindings(file, text)];
  },

  /** Formatting is decided by Prettier for every file type it supports. */
  async runTools(ctx) {
    const targets = ctx.allMode ? ["."] : ctx.files.filter((f) => PRETTIER_EXTENSIONS.test(f));
    if (targets.length === 0) return [];
    const bin = localBin(ctx.root, "prettier");
    if (!bin) return [missingTool(ctx, "prettier", { required: true, hint: "run pnpm install" })];

    const result = await run(bin, ["--list-different", "--log-level", "warn", ...targets], {
      cwd: ctx.root,
    });
    const out = [];
    for (const ln of result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)) {
      out.push(finding("format", ln, 1, "not formatted; run `pnpm format`"));
    }
    for (const ln of result.stderr.split("\n")) {
      const m = /^\[error\] (.+?): (.*?)(?: \((\d+):(\d+)\))?$/.exec(ln.trim());
      if (m) out.push(finding("syntax", m[1], Number(m[3] ?? 1), `cannot be parsed: ${m[2]}`));
    }
    return out;
  },
};
