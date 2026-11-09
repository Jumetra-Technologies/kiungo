import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { config } from "../config.mjs";

function git(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

const lines = (text) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function isIgnored(file) {
  const parts = file.split("/");
  if (parts.some((p) => config.ignoreDirs.includes(p))) return true;
  return config.ignoreFiles.includes(parts[parts.length - 1]);
}

function walk(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (config.ignoreDirs.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, out);
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

/** Every file in the project that is tracked, or untracked but not git-ignored. */
export function allFiles(root) {
  const listed = git(root, ["ls-files", "-co", "--exclude-standard"]);
  const files = listed === null ? walk(root) : lines(listed);
  return [...new Set(files)].filter((f) => !isIgnored(f) && existsSync(join(root, f)));
}

/** Files that differ from `base` plus anything modified, staged or untracked. */
export function changedFiles(root, base = "origin/main") {
  const refs = [base, "main", "origin/master", "master"];
  let diff = null;
  for (const ref of refs) {
    diff = git(root, ["diff", "--name-only", "--diff-filter=ACMR", `${ref}...HEAD`]);
    if (diff !== null) break;
  }
  if (diff === null) return null; // no usable base: caller falls back to everything
  const extra = [
    git(root, ["diff", "--name-only", "--diff-filter=ACMR"]),
    git(root, ["diff", "--name-only", "--cached", "--diff-filter=ACMR"]),
    git(root, ["ls-files", "-o", "--exclude-standard"]),
  ];
  const files = [...lines(diff), ...extra.flatMap(lines)];
  return [...new Set(files)].filter((f) => !isIgnored(f) && existsSync(join(root, f)));
}

export function fileSize(root, file) {
  return statSync(join(root, file)).size;
}
