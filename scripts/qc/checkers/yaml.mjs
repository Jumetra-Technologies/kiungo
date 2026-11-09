import { LineCounter, parseDocument } from "yaml";
import { YAML_EXTENSIONS, extensionOf } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";

// YAML: syntax and duplicate keys come from the YAML parser. GitHub workflow files get extra
// supply-chain and robustness rules because they decide what can be merged.

const isWorkflow = (file) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);

function workflowRules(file, text, data) {
  const out = [];
  if (!data || typeof data !== "object") return out;

  if (!("permissions" in data)) {
    out.push(
      finding(
        "workflow-permissions",
        file,
        1,
        "declare top-level `permissions:` (least privilege, e.g. contents: read)",
      ),
    );
  }
  for (const [name, job] of Object.entries(data.jobs ?? {})) {
    if (job && typeof job === "object" && !("timeout-minutes" in job)) {
      out.push(
        finding(
          "workflow-timeout",
          file,
          1,
          `job '${name}' has no timeout-minutes; a hung job would block merges`,
        ),
      );
    }
  }
  text.split("\n").forEach((ln, i) => {
    const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(ln);
    if (!m || m[1].startsWith("./")) return;
    const ref = m[1].split("@")[1];
    if (!ref)
      out.push(finding("workflow-action-pin", file, i + 1, `action '${m[1]}' has no version`));
    else if (/^(?:main|master|latest|HEAD)$/i.test(ref)) {
      out.push(
        finding(
          "workflow-action-pin",
          file,
          i + 1,
          `action '${m[1]}' tracks a moving branch; pin a version tag or commit`,
        ),
      );
    }
  });
  return out;
}

export function lintYaml(file, text) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true, prettyErrors: false });
  const out = [];
  for (const error of doc.errors) {
    const line = error.linePos?.[0]?.line ?? lineCounter.linePos(error.pos?.[0] ?? 0).line;
    out.push(finding("yaml-syntax", file, line, error.message.split("\n")[0]));
  }
  if (out.length > 0) return out;
  if (isWorkflow(file)) out.push(...workflowRules(file, text, doc.toJS()));
  return out;
}

export const yaml = {
  id: "yaml",
  label: "YAML",
  appliesTo: (file) => YAML_EXTENSIONS.includes(extensionOf(file)),
  lintText: lintYaml,
};
