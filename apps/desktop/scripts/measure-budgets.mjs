#!/usr/bin/env node
/**
 * Electron's startup and memory budgets (Sprint 2, HWT-05's PC side).
 *
 *   npm run build -w @kiungo/desktop && node scripts/measure-budgets.mjs [--runs 5] [--settle 5000] [--json out.json]
 *
 * Starts the built app, waits for the window, lets it settle, and reads
 * what the app itself measures (app:metrics): time to the window, the main
 * process's resident set, and the working set of every app process. On
 * Linux without a display it runs under xvfb-run when available.
 *
 * Phase Two budgets on the reference PC (Windows 10, dual-core, 4 GB, SSD):
 * window in 3 s or less, 300 MB or less idle. The cloud workspace is not
 * that PC; its numbers are a ceiling check, Brad's run is the real one.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const runs = Number(flag("--runs", 3));
const settle = Number(flag("--settle", 5000));
const jsonOut = flag("--json", null);

if (!existsSync(join(root, "out", "main", "index.js"))) {
  console.error("Build the app first: npm run build -w @kiungo/desktop");
  process.exit(1);
}
const electron = createRequire(import.meta.url)("electron");

function once() {
  return new Promise((resolve, reject) => {
    const useXvfb = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
    const cmd = useXvfb ? "xvfb-run" : electron;
    const cmdArgs = useXvfb ? ["-a", "-s", "-screen 0 1280x800x24", electron, "--no-sandbox", root] : [root];
    const started = performance.now();
    const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...process.env, KIUNGO_MEASURE_BUDGETS: String(settle), ELECTRON_ENABLE_LOGGING: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let metrics = null;
    child.stdout.on("data", (d) => {
      out += d;
      const line = out.split("\n").find((l) => l.startsWith("KIUNGO_METRICS "));
      if (line && !metrics) {
        metrics = JSON.parse(line.slice("KIUNGO_METRICS ".length));
        // Linux: the proportional set size shares each page between the processes that map it,
        // so the sum is what the app really costs. Working sets count shared pages once per process.
        if (process.platform === "linux") {
          for (const p of metrics.processes) {
            try {
              const pss = readFileSync(`/proc/${p.pid}/smaps_rollup`, "utf8").match(/^Pss:\s+(\d+) kB/m);
              if (pss) p.pssMb = Math.round(Number(pss[1]) / 1024);
            } catch {}
          }
          if (metrics.processes.every((p) => p.pssMb !== undefined)) metrics.totalPssMb = metrics.processes.reduce((a, p) => a + p.pssMb, 0);
        }
      }
    });
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { child.kill(); reject(new Error(`No metrics after ${settle + 30000} ms.\n${err.slice(-2000)}`)); }, settle + 30000);
    child.on("exit", () => {
      clearTimeout(timer);
      if (!metrics) return reject(new Error(`The app quit without printing metrics.\n${(out + err).slice(-2000)}`));
      resolve({ ...metrics, wallMsToExit: Math.round(performance.now() - started) });
    });
  });
}

const results = [];
for (let i = 0; i < runs; i++) results.push(await once());
const median = (key) => [...results].map((r) => r[key]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
const summary = {
  platform: `${process.platform}-${process.arch}`,
  electron: electron.version ?? undefined,
  runs: results,
  median: { toWindowShownMs: median("toWindowShownMs"), mainRssMb: median("mainRssMb"), totalMb: median("totalMb"), ...(results[0].totalPssMb !== undefined ? { totalPssMb: median("totalPssMb") } : {}) },
  budget: { toWindowShownMs: 3000, totalMb: 300 },
  note: "totalMb sums working sets, which count shared pages once per process; on Linux totalPssMb shares them out and is the number to read against the budget.",
};
const memory = summary.median.totalPssMb ?? summary.median.totalMb;
summary.pass = summary.median.toWindowShownMs <= 3000 && memory <= 300;
console.log(JSON.stringify(summary, null, 2));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + "\n");
