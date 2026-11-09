import { finding } from "./report.mjs";

/**
 * Builds the finding for a missing external tool. Required tools always fail the gate.
 * Optional tools only warn locally, and fail in CI where `--strict-tools` is set, so a
 * check can never be skipped silently on the machine that decides whether code is merged.
 */
export function missingTool(ctx, tool, { required = false, hint = "" } = {}) {
  const strict = required || ctx.options.strictTools;
  const suffix = hint ? ` (${hint})` : "";
  return finding(
    "tool-missing",
    "(environment)",
    1,
    strict
      ? `${tool} is not installed${suffix}`
      : `${tool} is not installed, its checks were skipped${suffix}`,
    strict ? "error" : "warning",
  );
}

/** Parses compiler style output: file:line:col: severity: message */
export const COMPILER_LINE = /^(.+?):(\d+):(?:\d+:)?\s*(fatal error|error|warning):\s*(.*)$/;
