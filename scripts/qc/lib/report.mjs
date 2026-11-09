/** A single problem found by the gate. */
export function finding(rule, file, line, message, severity = "error") {
  return { rule, severity, file, line: line ?? 1, message };
}

const escapeData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProp = (s) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

export function formatFinding(f, format, color = false) {
  if (format === "github") {
    const level = f.severity === "error" ? "error" : "warning";
    return `::${level} file=${escapeProp(f.file)},line=${f.line},title=${escapeProp(f.rule)}::${escapeData(f.message)}`;
  }
  const paint = (code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text);
  const mark = f.severity === "error" ? paint(31, "error  ") : paint(33, "warning");
  return `  ${mark} ${f.file}:${f.line}  ${f.message}  ${paint(90, `[${f.rule}]`)}`;
}

export function summarise(findings) {
  const byChecker = new Map();
  for (const f of findings) {
    const key = f.checker ?? "other";
    const entry = byChecker.get(key) ?? { errors: 0, warnings: 0 };
    if (f.severity === "error") entry.errors++;
    else entry.warnings++;
    byChecker.set(key, entry);
  }
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity !== "error").length,
    byChecker,
  };
}

export function renderText(findings, color = false) {
  const lines = [];
  const files = [...new Set(findings.map((f) => f.file))].sort();
  for (const file of files) {
    for (const f of findings.filter((x) => x.file === file).sort((a, b) => a.line - b.line)) {
      lines.push(formatFinding(f, "text", color));
    }
  }
  return lines.join("\n");
}

export function renderMarkdownSummary(findings, meta) {
  const { errors, warnings, byChecker } = summarise(findings);
  const rows = [...meta.checkers].map((id) => {
    const c = byChecker.get(id) ?? { errors: 0, warnings: 0 };
    return `| ${id} | ${c.errors} | ${c.warnings} |`;
  });
  return [
    `## Quality gate: ${errors === 0 ? "passed" : "FAILED"}`,
    "",
    `${errors} error(s), ${warnings} warning(s). Scope: ${meta.scope}.`,
    "",
    "| Language | Errors | Warnings |",
    "| --- | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}
