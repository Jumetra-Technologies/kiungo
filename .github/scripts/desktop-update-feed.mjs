#!/usr/bin/env node
/**
 * The in-app update feed for a release: the <channel>.yml files electron-updater
 * reads (its generic provider). electron-builder writes latest.yml (Windows) and
 * latest-linux.yml (every Linux package) beside the installers, naming each file
 * relative to the feed; this keeps the installer the app can update with (the
 * NSIS .exe, the AppImage), points it at the versioned GitHub release, and
 * copies the file to each channel the release is for. Everything else about the
 * installer (SHA-512, size, the AppImage's blockMapSize) is kept as written.
 *
 *   node desktop-update-feed.mjs <dist dir> <owner/repo> <tag> <channel> <out dir>
 *
 * The release workflow uploads them to the desktop-feed release, which the app
 * reads (apps/desktop/src/main/index.ts, UPDATE_FEED):
 *
 * - Windows (the NSIS .exe): beta.yml, latest.yml
 * - Linux (the AppImage only; .deb and .rpm can't update themselves): beta-linux.yml, latest-linux.yml
 * - macOS waits for signing (DSK-80), so it gets none.
 *
 * A beta release writes the beta files. A stable one writes both, so people on
 * beta get stable releases too.
 *
 * Differential downloads: on Windows electron-updater fetches <installer>.blockmap
 * from the same release, and the old version's from the address with the version
 * swapped (desktop-v0.12.0/Kiungo-0.12.0-… becomes desktop-v0.11.0/Kiungo-0.11.0-…),
 * which is why the tag and the file names both carry the version. The AppImage
 * carries its blockmap inside it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dump, load } from "js-yaml";

/** electron-builder's file for each platform the app updates on, and the suffix electron-updater asks for. */
export const FEED_SOURCES = [
  { file: "latest.yml", suffix: "", installer: /-win-x64\.exe$/ },
  { file: "latest-linux.yml", suffix: "-linux", installer: /-linux-x86_64\.AppImage$/ },
];

/** The channels a release's feed files go to. */
export function feedChannels(channel) {
  return channel === "stable" ? ["beta", "latest"] : ["beta"];
}

/**
 * One of electron-builder's files, with only the installer the app updates with
 * (the .deb and .rpm it lists beside the AppImage can't update themselves), its
 * `url` and `path` made absolute on the release at `base`. Throws when the file
 * is for another version or names no such installer, so a bad feed never goes out.
 */
export function pointAtRelease(yaml, { base, version, installer }) {
  const doc = load(yaml);
  if (!doc || typeof doc !== "object") throw new Error("The feed file is empty.");
  if (String(doc.version ?? "") !== version) throw new Error(`The feed file is for ${doc.version ?? "no version"}, not ${version}.`);
  const files = (Array.isArray(doc.files) ? doc.files : []).filter((f) => f && typeof f.url === "string" && !f.url.includes("/") && installer.test(f.url));
  if (!files.length) throw new Error("The feed file names no installer of this release.");
  const absolute = (name) => `${base}/${encodeURIComponent(name)}`;
  const out = {
    version: doc.version,
    files: files.map((f) => ({ ...f, url: absolute(f.url) })),
    path: absolute(files[0].url),
    sha512: files[0].sha512,
    ...(doc.releaseDate ? { releaseDate: doc.releaseDate } : {}),
    ...(doc.stagingPercentage ? { stagingPercentage: doc.stagingPercentage } : {}),
  };
  return dump(out, { lineWidth: -1, noRefs: true });
}

/** The feed files for a release from electron-builder's in `dist`: { "beta.yml": "...", ... }. */
export function buildFeed({ dist, repository, tag, channel, version }) {
  const base = `https://github.com/${repository}/releases/download/${tag}`;
  const out = {};
  for (const source of FEED_SOURCES) {
    const path = join(dist, source.file);
    if (!existsSync(path)) continue;
    const text = pointAtRelease(readFileSync(path, "utf8"), { base, version, installer: source.installer });
    for (const c of feedChannels(channel)) out[`${c}${source.suffix}.yml`] = text;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dist, repository, tag, channel = "beta", outDir = "feed"] = process.argv.slice(2);
  if (!dist || !repository || !tag) {
    console.error("usage: desktop-update-feed.mjs <dist dir> <owner/repo> <tag> [channel] [out dir]");
    process.exit(2);
  }
  const version = JSON.parse(readFileSync("apps/desktop/package.json", "utf8")).version;
  const files = buildFeed({ dist, repository, tag, channel, version });
  // Windows is the platform most people update on: without its file, stop rather than publish half a feed.
  if (!files["beta.yml"]) {
    console.error(`No latest.yml for the Windows installer in ${dist}: nothing for the update feed.`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(outDir, name), text);
    console.log(`  ${outDir}/${name}`);
  }
}
