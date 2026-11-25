#!/usr/bin/env node
/**
 * The Sprint 2 hardware check on a real Uno (#61). Brad runs this at the review.
 *
 *   npm run hardware-check -w @kiungo/desktop -- [--port COM5] [--skip-physical] [--out results.md]
 *
 * What to wire, step by step, is in docs/phase-two/sprint-2-hardware-check.md.
 * The script does the rest: builds the check sketch twice (Physical, then
 * Hybrid with a virtual HC-SR04), uploads each, reads what the sketch prints,
 * pushes distances from the PC, times the delay 20 times, compares the print
 * rate, and writes the record table.
 *
 * Needs Arduino CLI with arduino:avr installed (the app's own copy:
 * `npm run fetch:arduino-cli -w @kiungo/desktop`, then install the core from
 * the app or with `arduino-cli core install arduino:avr@1.8.6`) and the
 * NewPing library for the Physical build (`arduino-cli lib install NewPing`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SerialPort } from "serialport";

// The protocol helpers are TypeScript; this script runs under plain Node, so the few bytes
// it needs are written out here. They match packages/core/src/hybrid/protocol.ts.
function cobs(data) {
  const out = [];
  let codeAt = 0, code = 1;
  out.push(0);
  for (const b of data) {
    if (b === 0) { out[codeAt] = code; codeAt = out.length; out.push(0); code = 1; }
    else { out.push(b); code++; if (code === 0xff) { out[codeAt] = code; codeAt = out.length; out.push(0); code = 1; } }
  }
  out[codeAt] = code;
  out.push(0);
  return Buffer.from(out);
}
const frameSet = (sensor, value) => { const raw = Buffer.alloc(6); raw[0] = 0x02; raw[1] = sensor; raw.writeInt32LE(Math.trunc(value), 2); return cobs(raw); };
const frameHello = () => cobs(Buffer.from([0x01]));

class LinkReader {
  constructor() { this.buf = []; this.text = ""; this.lines = []; this.frames = []; }
  feed(bytes) {
    for (const b of bytes) {
      if (b !== 0) { this.buf.push(b); continue; }
      if (!this.buf.length) continue;
      const enc = this.buf; this.buf = [];
      const dec = [];
      let i = 0;
      try {
        while (i < enc.length) { const code = enc[i++]; if (code === 0) throw 0; for (let n = 1; n < code; n++) dec.push(enc[i++]); if (code !== 0xff && i < enc.length) dec.push(0); }
      } catch { continue; }
      if (dec[0] === 0x82) {
        this.text += Buffer.from(dec.slice(1)).toString("utf8");
        const parts = this.text.split("\n"); this.text = parts.pop();
        for (const p of parts) this.lines.push({ at: performance.now(), text: p.replace(/\r$/, "") });
      } else this.frames.push(dec);
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const repo = join(desktop, "..", "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const portArg = flag("--port", null);
const skipPhysical = args.includes("--skip-physical");
const outPath = flag("--out", join(repo, "docs", "phase-two", "sprint-2-hardware-results.md"));

const key = `${process.platform}-${process.arch}`;
const cli = process.env.KIUNGO_ARDUINO_CLI ?? join(desktop, "resources", "bin", key, process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli");
const config = process.env.KIUNGO_ARDUINO_CONFIG;
if (!existsSync(cli)) { console.error(`Arduino CLI not found at ${cli}. Run: npm run fetch:arduino-cli -w @kiungo/desktop`); process.exit(1); }
const run = (a) => execFileSync(cli, [...(config ? ["--config-file", config] : []), ...a], { encoding: "utf8", maxBuffer: 64 << 20 });
const ask = (q) => new Promise((r) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a.trim()); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- 0. Find the board -----
let port = portArg;
if (!port) {
  const list = JSON.parse(run(["board", "list", "--format", "json"]));
  const ports = (list.detected_ports ?? list).filter((p) => (p.port?.protocol ?? p.protocol) === "serial");
  const uno = ports.find((p) => JSON.stringify(p).includes("arduino:avr:uno")) ?? ports[0];
  port = uno?.port?.address ?? uno?.address;
  if (!port) { console.error("No serial board found. Plug the Uno in, or pass --port."); process.exit(1); }
}
console.log(`Board on ${port}`);

// ----- 1. Builds -----
const sketch = join(desktop, "resources", "sketches", "SonarPrint");
const hybridLibs = [join(desktop, "resources", "hybrid", "KiungoHybrid"), join(desktop, "resources", "hybrid", "adapters", "NewPing")];
const work = mkdtempSync(join(tmpdir(), "kiungo-hwcheck-"));
const shimHeader = join(work, "kiungo_shim.h");
// The same header @kiungo/core's generator writes for SPRINT_2_PLAN: one virtual HC-SR04 on D9/D10.
const table = Array.from({ length: 20 }, (_, i) => (i === 9 || i === 10 ? "0x00" : "0xff")).join(", ");
writeFileSync(shimHeader, `#pragma once\n#if __has_include(<kiungo_hybrid_marker.h>)\n#include <Arduino.h>\n#define KIUNGO_PIN_TABLE {${table}}\n#include <kiungo_hybrid.h>\n#define Serial kiungoSerial\n#define serialEvent kiungo_user_serialEvent\n#define digitalRead kiungo_digitalRead\n#define analogRead kiungo_analogRead\n#define pulseIn kiungo_pulseIn\n#define pulseInLong kiungo_pulseInLong\n#endif\n`);

function compile(name, extra) {
  const buildPath = join(work, name);
  mkdirSync(buildPath, { recursive: true });
  const out = run(["compile", "--fqbn", "arduino:avr:uno", "--build-path", buildPath, "--format", "json", ...extra, sketch]);
  const json = JSON.parse(out);
  if (!json.success) { console.error(json.compiler_err || out); process.exit(1); }
  const sizes = json.builder_result?.executable_sections_size ?? [];
  const text = sizes.find((s) => s.name === "text"), data = sizes.find((s) => s.name === "data");
  return { buildPath, flash: text?.size, ram: data?.size };
}
function upload(buildPath) {
  run(["upload", "--fqbn", "arduino:avr:uno", "--port", port, "--input-dir", buildPath]);
}

async function session(baud, body) {
  const sp = new SerialPort({ path: port, baudRate: baud });
  const reader = new LinkReader();
  const plain = { text: "", lines: [] };
  sp.on("data", (d) => {
    reader.feed(d);
    plain.text += d.toString("latin1");
    const parts = plain.text.split("\n"); plain.text = parts.pop();
    for (const p of parts) plain.lines.push({ at: performance.now(), text: p.replace(/\r$/, "") });
  });
  await new Promise((r) => sp.once("open", r));
  await sleep(2000); // the Uno resets on open (DTR); let it boot
  try { return await body(sp, reader, plain); } finally { await new Promise((r) => sp.close(() => r())); }
}

const record = [];
const lastNumber = (lines, since) => { const l = [...lines].reverse().find((x) => x.at > since && /^\d+$/.test(x.text)); return l ? Number(l.text) : null; };

// ----- 2. Physical baseline -----
let physical = null;
if (!skipPhysical) {
  console.log("\nStep 1: real sensor. Building the Physical sketch...");
  physical = compile("physical", []);
  upload(physical.buildPath);
  await session(9600, async (sp, _reader, plain) => {
    await ask("Hold the book at 20 cm from the sensor, then press Enter. ");
    const t = performance.now(); await sleep(1500);
    const at20 = lastNumber(plain.lines, t);
    await ask("Now 50 cm, then press Enter. ");
    const t2 = performance.now(); await sleep(1500);
    const at50 = lastNumber(plain.lines, t2);
    const rateStart = performance.now(); const before = plain.lines.length; await sleep(5000);
    physical.printsPerSecond = (plain.lines.length - before) / ((performance.now() - rateStart) / 1000);
    record.push({ step: "1 Real 20 cm, 50 cm", expected: "about 20, about 50", seen: `${at20 ?? "?"}, ${at50 ?? "?"}`, pass: at20 !== null && at50 !== null && Math.abs(at20 - 20) <= 3 && Math.abs(at50 - 50) <= 5 });
  });
}

// ----- 3. Hybrid: virtual sensor, delay, rate -----
console.log("\nStep 2: virtual sensor. Building the Hybrid sketch (the same source)...");
const hybrid = compile("hybrid", [...hybridLibs.flatMap((l) => ["--library", l]), "--build-property", `compiler.cpp.extra_flags=-include ${shimHeader}`]);
upload(hybrid.buildPath);
await session(115200, async (sp, reader) => {
  sp.write(frameHello());
  await sleep(300);
  const hello = reader.frames.find((f) => f[0] === 0x81);
  record.push({ step: "2a Link", expected: "HELLO answered", seen: hello ? `protocol ${hello[1]}, ${hello[2]} sensors` : "no answer", pass: Boolean(hello) });

  sp.write(frameSet(0, 30)); let t = performance.now(); await sleep(400);
  const v30 = lastNumber(reader.lines, t);
  sp.write(frameSet(0, 120)); t = performance.now(); await sleep(400);
  const v120 = lastNumber(reader.lines, t);
  record.push({ step: "2 Virtual 30 cm, 120 cm", expected: "30, 120", seen: `${v30 ?? "?"}, ${v120 ?? "?"}`, pass: v30 === 30 && v120 === 120 });

  // Delay: 20 switches, time to the first print of the new value.
  const delays = [];
  let value = 120;
  for (let i = 0; i < 20; i++) {
    await sleep(60 + ((i * 17) % 50));
    value = value === 30 ? 120 : 30;
    const seen = reader.lines.length;
    const sent = performance.now();
    sp.write(frameSet(0, value));
    const deadline = sent + 1000;
    let first = null;
    while (performance.now() < deadline) {
      first = reader.lines.slice(seen).find((l) => l.text === String(value));
      if (first) break;
      await sleep(2);
    }
    delays.push(first ? first.at - sent : Infinity);
  }
  const sorted = [...delays].sort((a, b) => a - b);
  const median = sorted[10], worst = sorted[19];
  record.push({ step: "3 Delay, median and worst", expected: "100 ms or less", seen: `${median.toFixed(0)} ms, ${Number.isFinite(worst) ? worst.toFixed(0) + " ms" : "never"}`, pass: worst <= 100 });

  const before = reader.lines.length; const start = performance.now(); await sleep(5000);
  hybrid.printsPerSecond = (reader.lines.length - before) / ((performance.now() - start) / 1000);
  if (physical) {
    const diff = Math.abs(hybrid.printsPerSecond - physical.printsPerSecond) / physical.printsPerSecond;
    record.push({ step: "4 Prints per second, real vs Hybrid", expected: "within 5 %", seen: `${physical.printsPerSecond.toFixed(1)} vs ${hybrid.printsPerSecond.toFixed(1)} (${(diff * 100).toFixed(1)} %)`, pass: diff <= 0.05 });
  } else {
    record.push({ step: "4 Prints per second, real vs Hybrid", expected: "within 5 %", seen: `Hybrid ${hybrid.printsPerSecond.toFixed(1)}/s (Physical skipped)`, pass: null });
  }
});

record.push({ step: "5 Flash and RAM: plain, Hybrid", expected: "Hybrid adds about 1.6 KB / 190 B", seen: `${physical ? `${physical.flash} / ${physical.ram}` : "?"}, ${hybrid.flash} / ${hybrid.ram}`, pass: physical ? hybrid.flash - physical.flash < 3000 : null });

// ----- 4. Unplug -----
await ask("\nStep 6: pull the USB cable now, wait 3 s, plug it back in, then press Enter. ");
await sleep(3000);
let restarted = false;
try {
  await session(115200, async (sp, reader) => {
    sp.write(frameHello()); await sleep(300);
    restarted = reader.frames.some((f) => f[0] === 0x81);
  });
} catch {}
record.push({ step: "6 Unplug and replug", expected: "clean restart", seen: restarted ? "board answered HELLO after replug" : "no answer after replug", pass: restarted });

// ----- 5. The record -----
const table_ = ["| Step | Expected | Seen | Pass |", "| --- | --- | --- | --- |", ...record.map((r) => `| ${r.step} | ${r.expected} | ${r.seen} | ${r.pass === null ? "n/a" : r.pass ? "yes" : "**no**"} |`)].join("\n");
const report = `# Sprint 2 hardware check results\n\n${new Date().toISOString()} on ${process.platform}-${process.arch}, board on ${port}.\n\n${table_}\n`;
writeFileSync(outPath, report);
console.log(`\n${table_}\n\nwrote ${outPath}`);
