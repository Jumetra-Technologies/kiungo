import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { extensionOf } from "../lib/comments.mjs";
import { finding } from "../lib/report.mjs";

// Markdown: balanced code fences and links that resolve. Docs that point nowhere are bugs.

const LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

export function lintMarkdown(file, text, ctx = {}) {
  const out = [];
  const exists = ctx.exists ?? ((path) => existsSync(join(ctx.root ?? ".", path)));
  let fence = null;
  let fenceLine = 0;

  text.split("\n").forEach((raw, index) => {
    const lineNo = index + 1;
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (marker) {
      if (!fence) {
        fence = marker[1][0];
        fenceLine = lineNo;
      } else if (marker[1][0] === fence) {
        fence = null;
      }
      return;
    }
    if (fence) return;

    const prose = raw.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(LINK)) {
      const target = match[1];
      if (EXTERNAL.test(target) || /[{}$]/.test(target)) continue;
      const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
      if (path === "") continue;
      const resolved = normalize(path.startsWith("/") ? path.slice(1) : join(dirname(file), path))
        .split("\\")
        .join("/");
      if (!exists(resolved))
        out.push(finding("broken-link", file, lineNo, `link target '${target}' does not exist`));
    }
  });

  if (fence) out.push(finding("markdown-fence", file, fenceLine, "code fence is never closed"));
  return out;
}

export const markdown = {
  id: "markdown",
  label: "Markdown",
  appliesTo: (file) => extensionOf(file) === "md",
  lintText: lintMarkdown,
};
