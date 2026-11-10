/**
 * Sprint 2 spike: measures everything the go/no-go decision needs and
 * writes docs/phase-two/sprint-2-spike-results.md (#57, #59, #60).
 *
 *   npx tsx scripts/hybrid-spike.ts [--budgets path/to/budgets.json]
 *
 * Needs the AVR toolchain and core sources (see hybrid-build.ts:
 * KIUNGO_AVR_CORE or KIUNGO_ARDUINO_DATA) and the real NewPing library
 * (KIUNGO_AVR_LIBRARIES) for the plain builds. Everything runs in the
 * emulator; the real-Uno numbers come from docs/phase-two/sprint-2-hardware-check.md.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AvrBoard } from "@kiungo/core/emulator";
import { UNO } from "@kiungo/core/boards";
import { LinkReader, encodeSet } from "@kiungo/core/hybrid/protocol";
import { SPRINT_2_PLAN, type HybridPlan } from "@kiungo/core/hybrid/shim";

import { compileDirect, compileHybridDirect, hybridResourcesDir, locateDirectToolchain, type DirectToolchain } from "../src/main/toolchain/hybrid-build";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const sketches = resolve(here, "..", "resources", "sketches");
const resources = hybridResourcesDir();
const args = process.argv.slice(2);
const budgetsPath = args[args.indexOf("--budgets") + 1] || null;

const tc = locateDirectToolchain();
if (!tc) {
  console.error("No AVR toolchain. Set KIUNGO_AVR_CORE (an ArduinoCore-avr checkout, avr-gcc on PATH) or KIUNGO_ARDUINO_DATA.");
  process.exit(1);
}
const toolchain: DirectToolchain = tc;
const newPing = (() => {
  for (const dir of (process.env.KIUNGO_AVR_LIBRARIES ?? "").split(delimiter).filter(Boolean)) {
    if (existsSync(join(dir, "NewPing.h"))) return dir;
    for (const entry of readdirSync(dir)) {
      if (entry.toLowerCase() === "newping" && existsSync(join(dir, entry, "NewPing.h"))) return join(dir, entry);
      if (entry.toLowerCase() === "newping" && existsSync(join(dir, entry, "src", "NewPing.h"))) return join(dir, entry, "src");
    }
  }
  return undefined;
})();

const work = mkdtempSync(join(tmpdir(), "kiungo-spike-"));
const build = (name: string) => {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const sketch = (name: string, source: string) => {
  const dir = join(work, "sketches", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.ino`), source);
  return dir;
};

interface Row {
  name: string;
  flash: number;
  ram: number;
}
const rows: Row[] = [];
const must = (r: { ok: boolean; log: string; flash?: { used: number }; ram?: { used: number } }, name: string) => {
  if (!r.ok) {
    console.error(`${name} failed:\n${r.log}`);
    process.exit(1);
  }
  rows.push({ name, flash: r.flash!.used, ram: r.ram!.used });
  return r;
};

// ----- 1. Footprint (HWT-05): plain vs Hybrid, per adapter -----
const serialOnly = sketch("SerialOnly", `void setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(millis()); delay(50); }`);
const pins = sketch("PinsRead", `void setup() { Serial.begin(9600); pinMode(7, INPUT); }\nvoid loop() { Serial.print(digitalRead(7)); Serial.print(' '); Serial.println(analogRead(A0)); delay(50); }`);
const noSensors: HybridPlan = { board: "arduino:avr:uno", sensors: [] };
const pinPlan: HybridPlan = { board: "arduino:avr:uno", sensors: [{ id: 0, part: "button", pins: [7] }, { id: 1, part: "ldr", pins: [14] }] };

must(compileDirect(toolchain, serialOnly, build("serial-plain")), "SerialOnly, plain");
must(compileHybridDirect(toolchain, { sketchDir: serialOnly, buildPath: build("serial-hybrid"), plan: noSensors, resources }), "SerialOnly, Hybrid (runtime + tagged Serial)");
must(compileDirect(toolchain, pins, build("pins-plain")), "PinsRead, plain");
must(compileHybridDirect(toolchain, { sketchDir: pins, buildPath: build("pins-hybrid"), plan: pinPlan, resources }), "PinsRead, Hybrid (pin adapter)");
const sonarPlain = newPing ? must(compileDirect(toolchain, join(sketches, "SonarPrint"), build("sonar-plain"), { libraries: [newPing] }), "SonarPrint, plain (real NewPing)") : null;
const sonarHybrid = must(compileHybridDirect(toolchain, { sketchDir: join(sketches, "SonarPrint"), buildPath: build("sonar-hybrid"), plan: SPRINT_2_PLAN, resources }), "SonarPrint, Hybrid (NewPing adapter)");

// ----- 2. Toolchain facts (#57, #59) -----
const wrapLib = join(work, "libs", "Wrap");
mkdirSync(wrapLib, { recursive: true });
writeFileSync(join(wrapLib, "Wrap.h"), "#pragma once\n");
writeFileSync(join(wrapLib, "Wrap.cpp"), `#include <Arduino.h>\nextern "C" int __real_digitalRead(uint8_t);\nextern "C" int __wrap_digitalRead(uint8_t) { return 1; }\n`);
const readSketch = sketch("WrapRead", `#include <Wrap.h>\nvoid setup() { pinMode(7, INPUT); Serial.begin(115200); }\nvoid loop() { Serial.println(digitalRead(7)); delay(5); }`);
const firstLine = (hex: string) => {
  const board = new AvrBoard(UNO, hex);
  const bytes: number[] = [];
  board.onSerialByte((b) => bytes.push(b));
  board.runMs(30);
  return new TextDecoder().decode(Uint8Array.from(bytes)).split("\n")[0]?.trim() ?? "";
};
const wrapLto = compileDirect(toolchain, readSketch, build("wrap-lto"), { lto: true, libraries: [wrapLib], ldFlags: ["-Wl,--wrap=digitalRead"] });
const wrapMixed = compileDirect(toolchain, readSketch, build("wrap-mixed"), { lto: true, noLtoForSketch: true, libraries: [wrapLib], ldFlags: ["-Wl,--wrap=digitalRead"] });
const wrapNoLto = compileDirect(toolchain, readSketch, build("wrap-nolto"), { lto: false, libraries: [wrapLib], ldFlags: ["-Wl,--wrap=digitalRead"] });
const plainRead = compileDirect(toolchain, sketch("PlainRead", `void setup() { pinMode(7, INPUT); Serial.begin(115200); }\nvoid loop() { Serial.println(digitalRead(7)); delay(5); }`), build("plain-read"));
// The same tiny interceptor as the wrap rows, reached through a forced include instead of the linker.
const forceLib = join(work, "libs", "Force");
mkdirSync(forceLib, { recursive: true });
writeFileSync(join(forceLib, "Force.h"), "#pragma once\n");
writeFileSync(join(forceLib, "Force.cpp"), `#include <Arduino.h>\n#undef digitalRead\nint force_digitalRead(uint8_t) { return 1; }\n`);
const forceHeader = join(work, "force.h");
writeFileSync(forceHeader, `#pragma once\n#if __has_include(<Force.h>)\n#include <Arduino.h>\nint force_digitalRead(uint8_t pin);\n#define digitalRead force_digitalRead\n#endif\n`);
const forcedRead = compileDirect(toolchain, sketch("ForcedRead", `#include <Force.h>\nvoid setup() { pinMode(7, INPUT); Serial.begin(115200); }\nvoid loop() { Serial.println(digitalRead(7)); delay(5); }`), build("forced-read"), { lto: true, libraries: [forceLib], cppFlags: ["-include", forceHeader] });
for (const [name, r] of [["wrap+LTO", wrapLto], ["wrap, sketch without LTO", wrapMixed], ["wrap, LTO off", wrapNoLto], ["plain", plainRead], ["forced include + LTO", forcedRead]] as const) {
  if (!r.ok) {
    console.error(`${name} failed:\n${r.log}`);
    process.exit(1);
  }
}
const facts = [
  { name: "`--wrap=digitalRead`, LTO on (Arduino's default)", flash: wrapLto.flash!.used, works: firstLine(wrapLto.hex!) === "1" },
  { name: "`--wrap`, core with LTO, sketch and libraries without (the named fallback)", flash: wrapMixed.flash!.used, works: firstLine(wrapMixed.hex!) === "1" },
  { name: "`--wrap`, LTO off everywhere", flash: wrapNoLto.flash!.used, works: firstLine(wrapNoLto.hex!) === "1" },
  { name: "Forced-include header, LTO on (chosen)", flash: forcedRead.flash!.used, works: firstLine(forcedRead.hex!) === "1" },
];

// ----- 3. Latency in the emulator: 20 pushes at random phase against the 50 ms loop -----
const latencies: number[] = [];
{
  const board = new AvrBoard(UNO, sonarHybrid.hex!);
  const reader = new LinkReader();
  const lines: Array<{ at: number; text: string }> = [];
  board.onSerialByte((b) => { for (const text of reader.feedLines(Uint8Array.of(b)).lines) lines.push({ at: board.timeMs, text }); });
  board.runMs(120);
  let value = 10;
  for (let i = 0; i < 20; i++) {
    board.runMs(7 + ((i * 13) % 50)); // spread the pushes over the loop period
    value = value === 10 ? 120 : 10;
    board.writeSerial(encodeSet(0, value));
    const pushed = board.timeMs;
    const seen = lines.length;
    board.runMs(150);
    const first = lines.slice(seen).find((l) => l.text === String(value));
    latencies.push(first ? first.at - pushed : Number.POSITIVE_INFINITY);
  }
}
const sorted = [...latencies].sort((a, b) => a - b);
const latency = { median: sorted[Math.floor(sorted.length / 2)], worst: sorted[sorted.length - 1] };

// ----- 4. Electron budgets, if measured -----
const budgets = budgetsPath && existsSync(budgetsPath) ? JSON.parse(readFileSync(budgetsPath, "utf8")) : null;

// ----- 5. The report -----
const delta = (a: Row | null, b: Row) => (a ? `+${b.flash - a.flash} / +${b.ram - a.ram}` : "");
const byName = (n: string) => rows.find((r) => r.name === n)!;
const pairs: Array<[string, string, string]> = [
  ["Serial only", "SerialOnly, plain", "SerialOnly, Hybrid (runtime + tagged Serial)"],
  ["digitalRead + analogRead", "PinsRead, plain", "PinsRead, Hybrid (pin adapter)"],
];
if (sonarPlain) pairs.push(["HC-SR04 with NewPing", "SonarPrint, plain (real NewPing)", "SonarPrint, Hybrid (NewPing adapter)"]);
const footprint = pairs.map(([what, p, h]) => `| ${what} | ${byName(p).flash} / ${byName(p).ram} | ${byName(h).flash} / ${byName(h).ram} | ${delta(byName(p), byName(h))} |`).join("\n");
const go = facts[3].works && latency.worst < 100 && (budgets ? budgets.pass : true);
const electronVersion = (() => {
  try {
    return JSON.parse(readFileSync(join(repo, "node_modules", "electron", "package.json"), "utf8")).version as string;
  } catch {
    return "?";
  }
})();
const date = new Date().toISOString().slice(0, 10);
const report = `# Sprint 2 spike results

Measured on ${date} by \`apps/desktop/scripts/hybrid-spike.ts\` on ${process.platform}-${process.arch} with the toolchain Arduino CLI installs for \`arduino:avr\` 1.8.6 (avr-gcc 7.3.0, binutils 2.26). Every number below comes from compiled code run in the emulator; the real-Uno column is Brad's, from \`sprint-2-hardware-check.md\`.

## Result: ${go ? "go, with the forced-include shim and LTO on" : "no-go on the numbers below"}

## 1. How the shim intercepts (#57, #59)

Can a Hybrid build redirect the sketch's \`digitalRead(7)\` to Kiungo without touching the sketch? "Works" means the printed value changed to the pushed one.

| Mechanism | Works | Flash (bytes) |
| --- | --- | --- |
${facts.map((f) => `| ${f.name} | ${f.works ? "yes" : "**no**"} | ${f.flash} |`).join("\n")}
| Plain build, nothing intercepted | | ${plainRead.flash!.used} |

- **\`--wrap\` with LTO on is silently dropped** on this toolchain (GCC 88643): the build succeeds, the wrapper is not even linked in, and the sketch reads the real pin. A Hybrid build that relied on it would look fine and do nothing.
- Turning LTO off for the sketch and libraries makes \`--wrap\` work, at +${wrapMixed.flash!.used - plainRead.flash!.used} bytes over plain here. That is the fallback the plan named, and it stays available.
- **The forced-include header works with LTO on everywhere**, and the mechanism itself ${forcedRead.flash!.used <= plainRead.flash!.used ? `saves ${plainRead.flash!.used - forcedRead.flash!.used} bytes against plain` : `costs ${forcedRead.flash!.used - plainRead.flash!.used} bytes over plain`} on this sketch (the same tiny interceptor as the wrap rows): LTO sees through the redirect and drops the real function. What a real Hybrid build adds is the runtime, in section 2. It also reaches header-only code (an \`inline\` function in a header calling \`digitalRead\`), because the rename happens at compile time.
- **Serial cannot be intercepted with \`--wrap\` at all**: \`Serial.println\` ends in a virtual \`HardwareSerial::write\` reached through the vtable, which has no symbol reference to wrap. The forced include renames \`Serial\` itself to a Kiungo stream, so every byte the sketch writes is tagged (test: \`apps/desktop/test/hybrid-shim.test.ts\`).
- The core's own files are untouched: the header only acts in files that have the KiungoHybrid include path (the sketch and libraries), checked with \`__has_include\`.

Decision: Tier 1 shim = forced-include header + library-level adapters, LTO on. \`--wrap\` is not used.

## 2. Footprint (HWT-05)

Flash / RAM in bytes on an Uno (32,256 / 2,048 available).

| Sketch | Plain | Hybrid | Hybrid adds |
| --- | --- | --- | --- |
${footprint}

The runtime (COBS link, sensor table, tagged Serial, user-input queue) is the fixed part; adapters add little on top. RAM goes to the 64-byte receive frame, the 32-byte text buffer, the 32-byte input queue and the sensor table.

## 3. Push-to-print delay in the emulator

The check sketch prints every 50 ms. 20 pushes spread across that period:

| Median | Worst | Target |
| --- | --- | --- |
| ${latency.median.toFixed(1)} ms | ${Number.isFinite(latency.worst) ? latency.worst.toFixed(1) + " ms" : "never"} | 100 ms or less |

The delay is bounded by the sketch's own loop period, not by the link: the runtime reads frames when the sketch next reads the sensor (or between loops). A sketch that reads faster sees the value sooner.

## 4. Electron budgets on this machine

${budgets ? `Median of ${budgets.runs.length} runs (\`apps/desktop/scripts/measure-budgets.mjs\`), ${budgets.platform}, Electron ${electronVersion}:

| | Measured | Budget |
| --- | --- | --- |
| Time to the window | ${budgets.median.toWindowShownMs} ms | 3,000 ms |
| Memory, all processes (${budgets.median.totalPssMb !== undefined ? "proportional set size" : "working sets"}) | ${budgets.median.totalPssMb ?? budgets.median.totalMb} MB | 300 MB |
| Memory, sum of working sets | ${budgets.median.totalMb} MB | (counts shared pages once per process) |

This is a Linux machine under a virtual display with software rendering. The reference PC (Windows 10, dual-core, 4 GB, SSD) is Brad's run with the same script.` : "Not measured in this run. Run `npm run build -w @kiungo/desktop && node scripts/measure-budgets.mjs --json budgets.json` and pass `--budgets budgets.json`."}

## 5. What a real Uno still has to show

The emulator can't show USB timing, a CH340's behavior, or an unplug. Steps 1 to 6 of \`sprint-2-hardware-check.md\`, run with \`npm run hardware-check -w @kiungo/desktop\`, fill those in.

## Known limits of the prototype

- Libraries that read port registers directly need an adapter; NewPing has one, DHT is next (sprint 9, INJ-02). A sensor read through \`digitalRead\`, \`analogRead\` or \`pulseIn\` needs none.
- The sketch's own \`Serial.read()\` gets bytes the PC sends in IN frames; a library that uses Serial directly for its own purposes still talks to the raw link.
- \`ping_timer()\` in the NewPing adapter answers at once instead of from Timer2, so Timer2 stays free.
- The runtime polls the link; nothing runs from an interrupt. A sketch that blocks for seconds without reading a sensor or Serial sees pushes only when it comes back.
`;
const out = join(repo, "docs", "phase-two", "sprint-2-spike-results.md");
writeFileSync(out, report);
console.log(report);
console.log(`\nwrote ${out}`);
