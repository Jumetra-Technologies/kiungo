#!/usr/bin/env node
/**
 * Downloads the pinned Arduino CLI for each system the app ships on, checks
 * it against the checksums Arduino publishes with the release, and unpacks it
 * to resources/bin/<platform>-<arch>/, where the app and electron-builder look.
 *
 *   node scripts/fetch-arduino-cli.mjs            this computer's system only
 *   node scripts/fetch-arduino-cli.mjs --all      every target (CI release builds)
 *
 * To move to a new version, change VERSION and copy the matching lines from
 * https://github.com/arduino/arduino-cli/releases/download/v<VERSION>/<VERSION>-checksums.txt
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.5.1";

// From 1.5.1-checksums.txt (released 5 June 2026).
const TARGETS = {
  "win32-x64": { file: `arduino-cli_${VERSION}_Windows_64bit.zip`, sha256: "fabe42e0eb04d00e776a66178299ff95a46c623dbc260f997e58fd514853dd40" },
  "linux-x64": { file: `arduino-cli_${VERSION}_Linux_64bit.tar.gz`, sha256: "28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b" },
  "linux-arm64": { file: `arduino-cli_${VERSION}_Linux_ARM64.tar.gz`, sha256: "1e69e077479f300614d4551334e0a33f08ee40b04315d83b8e7e0e94f0d0ee62" },
  "darwin-x64": { file: `arduino-cli_${VERSION}_macOS_64bit.tar.gz`, sha256: "c982e940027996bea9901050e95fae99c59c1dcfee54beedecaf28141e7bf2e7" },
  "darwin-arm64": { file: `arduino-cli_${VERSION}_macOS_ARM64.tar.gz`, sha256: "cb952e8c1621c95ef5f1d17831c945e3d0ec5973f89c557a7ec8feb9c4f7d4c9" },
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wanted = process.argv.includes("--all") ? Object.keys(TARGETS) : [`${process.platform}-${process.arch}`];

/**
 * GitHub's release downloads answer 502, 503 or 504 now and then, and a
 * connection can drop: those are tried again, a few seconds apart. A 404 or
 * other answer is final. The checksum below still decides what's installed.
 */
export async function download(url, { attempts = 4, wait = (ms) => new Promise((r) => setTimeout(r, ms)), get = fetch, log = console.warn } = {}) {
  for (let attempt = 1; ; attempt++) {
    let problem;
    try {
      const response = await get(url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) throw Object.assign(new Error(`download failed (${response.status}) from ${url}`), { final: true });
      problem = `${response.status}`;
    } catch (error) {
      if (error.final || attempt >= attempts) throw error.final ? error : new Error(`download failed (${error.message}) from ${url}`);
      problem = error.message;
    }
    if (attempt >= attempts) throw new Error(`download failed (${problem}) from ${url}, ${attempts} tries`);
    const ms = 2000 * 2 ** (attempt - 1);
    log(`  ${url}: ${problem}, trying again in ${ms / 1000} s (${attempt + 1} of ${attempts})`);
    await wait(ms);
  }
}

async function fetchTarget(key) {
  const target = TARGETS[key];
  if (!target) throw new Error(`No Arduino CLI build is pinned for ${key}.`);
  const outDir = join(root, "resources", "bin", key);
  const exe = key.startsWith("win32") ? "arduino-cli.exe" : "arduino-cli";
  const stamp = join(outDir, ".version");
  if (existsSync(join(outDir, exe)) && existsSync(stamp)) {
    console.log(`${key}: Arduino CLI ${VERSION} already present`);
    return;
  }
  const url = `https://github.com/arduino/arduino-cli/releases/download/v${VERSION}/${target.file}`;
  let bytes;
  try {
    bytes = await download(url);
  } catch (error) {
    throw new Error(`${key}: ${error.message}`);
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== target.sha256) throw new Error(`${key}: checksum mismatch. Expected ${target.sha256}, got ${sha}. Nothing was installed.`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const archive = join(outDir, target.file);
  writeFileSync(archive, bytes);
  // tar reads .zip too on Windows 10+ and macOS (bsdtar); on Linux, unzip handles the Windows build.
  if (target.file.endsWith(".zip") && process.platform === "linux") execFileSync("unzip", ["-o", "-q", archive, exe, "-d", outDir]);
  else execFileSync("tar", ["-xf", archive, "-C", outDir, exe]);
  rmSync(archive);
  if (!exe.endsWith(".exe")) chmodSync(join(outDir, exe), 0o755);
  writeFileSync(stamp, `${VERSION}\n`);
  console.log(`${key}: Arduino CLI ${VERSION} installed in resources/bin/${key}`);
}

// Run as a script (npm run fetch:arduino-cli); imported, it only offers download().
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  for (const key of wanted) await fetchTarget(key);
}
