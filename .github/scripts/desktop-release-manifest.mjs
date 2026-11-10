#!/usr/bin/env node
/**
 * The release manifest for a set of desktop installers: what the backend's
 * POST /releases takes (jumetra-backend docs/releases.md), and what the
 * website reads from a GitHub release when the backend has no release yet.
 *
 *   node desktop-release-manifest.mjs <dist dir> <repository> <tag> <channel> <out dir>
 *
 * Writes <out dir>/kiungo-release.json and <out dir>/notes.md (the newest
 * CHANGELOG section). Each installer's platform, architecture and kind come
 * from its file name (apps/desktop/electron-builder.yml names them).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** platform, arch and kind from an installer's name. */
export function classify(name) {
  const lower = name.toLowerCase();
  const arch = /arm64|aarch64/.test(lower) ? "arm64" : "x64";
  if (lower.endsWith(".exe")) return { platform: "windows", arch, kind: "nsis" };
  if (lower.endsWith(".dmg")) return { platform: "macos", arch, kind: "dmg" };
  if (lower.endsWith(".appimage")) return { platform: "linux", arch, kind: "appimage" };
  if (lower.endsWith(".deb")) return { platform: "linux", arch, kind: "deb" };
  if (lower.endsWith(".rpm")) return { platform: "linux", arch, kind: "rpm" };
  if (lower.endsWith(".zip")) return { platform: lower.includes("mac") || lower.includes("darwin") ? "macos" : "windows", arch, kind: "zip" };
  return null;
}

/** The newest CHANGELOG section: from its heading to the next version's. */
export function latestChangelogSection(changelog) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => /^## \[\d/.test(l));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n").trim();
}

/** The manifest and the release notes for the installers in `dist`. */
export function buildManifest({ dist, repository, tag, channel, version, changelog, now = new Date() }) {
  const files = [];
  for (const name of readdirSync(dist).sort()) {
    const target = classify(name);
    if (!target) continue;
    const path = join(dist, name);
    files.push({
      ...target,
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`,
      sha512: createHash("sha512").update(readFileSync(path)).digest("base64"),
      size: statSync(path).size,
      name,
    });
  }
  const section = latestChangelogSection(changelog).replace(/^## \[[^\]]+\][^\n]*\n*/, "");
  const notes = [
    `Kiungo for your computer, version ${version}${channel === "beta" ? " (beta)" : ""}.`,
    "",
    channel === "beta" ? "A beta build. The installers aren't signed yet, so Windows and macOS warn before the first launch: on Windows choose More info, then Run anyway; on macOS right-click the app and choose Open." : "",
    "",
    section,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const manifest = {
    channel,
    version,
    notes: notes.slice(0, 20_000),
    published_at: now.toISOString(),
    files: files.map((f) => ({ platform: f.platform, arch: f.arch, kind: f.kind, url: f.url, sha512: f.sha512, size: f.size })),
  };
  const table = `| Installer | Size | SHA-512 (base64) |\n|---|---|---|\n${files.map((f) => `| ${f.name} | ${(f.size / 1024 / 1024).toFixed(0)} MB | \`${f.sha512}\` |`).join("\n")}`;
  return { manifest, notes: `${notes}\n\n${table}\n`, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dist, repository, tag, channel = "beta", out = "release"] = process.argv.slice(2);
  if (!dist || !repository || !tag) {
    console.error("usage: desktop-release-manifest.mjs <dist dir> <owner/repo> <tag> [channel] [out dir]");
    process.exit(2);
  }
  const version = JSON.parse(readFileSync("apps/desktop/package.json", "utf8")).version;
  const { manifest, notes, files } = buildManifest({ dist, repository, tag, channel, version, changelog: readFileSync("CHANGELOG.md", "utf8") });
  if (!files.length) {
    console.error(`No installers in ${dist}.`);
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "kiungo-release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(out, "notes.md"), notes);
  console.log(`${files.length} installers for ${version} (${channel}) → ${out}/kiungo-release.json`);
  for (const f of files) console.log(`  ${f.platform} ${f.arch} ${f.kind}  ${f.name}  ${(f.size / 1024 / 1024).toFixed(1)} MB`);
}
