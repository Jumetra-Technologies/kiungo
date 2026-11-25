#!/usr/bin/env node
/**
 * DSK-21: does the lab stay smooth with 40 parts and 200 wires?
 *
 *   npm run build -w @kiungo/desktop && npm run measure-lab -w @kiungo/desktop [-- --view top|reality|flow] [--seconds 4] [--json out.json]
 *
 * --parts and --wires change the build (40 and 200 by default), so a small
 * build can be measured too: if it pans no faster, the limit isn't the lab.
 *
 * Makes a test project with 40 parts and 200 wires in a temporary folder,
 * starts the built app with its own temporary settings (your projects and
 * recent list are untouched), opens the project, drags the canvas around for
 * a few seconds and counts the frames the window drew. Target on the
 * reference PC: 60 fps, with the 95th-percentile frame under 25 ms.
 *
 * The cloud workspace draws without a graphics card, so its numbers only
 * show the script works. The reference PC's run is the real check.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const view = flag("--view", "top");
const seconds = Number(flag("--seconds", 4));
const jsonOut = flag("--json", null);
const port = Number(flag("--port", 9339));
const parts = Number(flag("--parts", 40));
const wiresWanted = Number(flag("--wires", 200));

if (!existsSync(join(root, "out", "main", "index.js"))) {
  console.error("Build the app first: npm run build -w @kiungo/desktop");
  process.exit(1);
}
if (typeof WebSocket === "undefined") {
  console.error("This script needs Node 22 or later (it uses Node's built-in WebSocket).");
  process.exit(1);
}

// 1. A throwaway home for the app, with the test project on its recent list.
const work = mkdtempSync(join(tmpdir(), "kiungo-measure-lab-"));
const project = join(work, "Stress test");
const userData = join(work, "userdata");
mkdirSync(userData, { recursive: true });
await new Promise((resolve, reject) => {
  const make = spawn(process.execPath, ["--import", "tsx", join(root, "scripts", "make-stress-project.ts"), project], { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, STRESS_PARTS: String(parts), STRESS_WIRES: String(wiresWanted) } });
  make.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`make-stress-project exited with ${code}`))));
});
writeFileSync(join(userData, "recent-projects.json"), JSON.stringify([{ path: project, openedAt: new Date().toISOString() }]));

// 2. Start the app with remote debugging, so this script can drive it.
const electron = createRequire(import.meta.url)("electron");
const useXvfb = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const appArgs = [...(process.platform === "linux" ? ["--no-sandbox"] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, root];
// Under xvfb-run the app is a grandchild: start a process group so quitting reaches it.
const child = spawn(useXvfb ? "xvfb-run" : electron, useXvfb ? ["-a", "-s", "-screen 0 1440x900x24", electron, ...appArgs] : appArgs, { cwd: root, stdio: "ignore", detached: useXvfb });
const quit = () => {
  try {
    if (useXvfb) process.kill(-child.pid, "SIGTERM");
    else child.kill();
  } catch {}
};
process.on("exit", quit);

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.addEventListener("open", r);
          ws.addEventListener("error", j);
        });
        return ws;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("The app didn't open a window.");
}

const ws = await connect();
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++nextId;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expression, what) => {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${what}.`);
};

try {
  // 3. Open the project and pick the view.
  await waitFor("!!document.querySelector('[data-testid=project-card]')", "Home");
  await evaluate("document.querySelector('[data-testid=project-card]').click()");
  await waitFor(`document.querySelectorAll('.react-flow__node').length >= ${parts}`, `the ${parts} parts`);
  const keyFor = { reality: "1", top: "2", flow: "3" }[view] ?? "2";
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: keyFor, code: `Digit${keyFor}`, text: type === "keyDown" ? keyFor : undefined });
  await sleep(1500);
  const counts = await evaluate("({ parts: document.querySelectorAll('.react-flow__node').length, wires: document.querySelectorAll('.react-flow__edge').length })");

  // 4. Count frames while dragging the canvas back and forth.
  await evaluate(`(() => {
    window.__kiungoFrames = [];
    const tick = (t) => { window.__kiungoFrames.push(t); if (window.__kiungoFrames.length < 100000 && !window.__kiungoStop) requestAnimationFrame(tick); };
    window.__kiungoStop = false;
    requestAnimationFrame(tick);
  })()`);
  const pane = await evaluate("(() => { const r = document.querySelector('.react-flow__pane').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()");
  const steps = Math.round(seconds * 120);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pane.x, y: pane.y, button: "left", buttons: 1, clickCount: 1 });
  const started = performance.now();
  for (let i = 1; i <= steps; i++) {
    const dx = Math.sin((i / steps) * Math.PI * 4) * pane.w * 0.3;
    const dy = Math.cos((i / steps) * Math.PI * 2) * 120 - 120;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pane.x + dx, y: pane.y + dy, button: "left", buttons: 1 });
    const due = started + (i * seconds * 1000) / steps;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pane.x, y: pane.y, button: "left", buttons: 0, clickCount: 1 });
  const frames = await evaluate("(() => { window.__kiungoStop = true; return window.__kiungoFrames; })()");

  const gaps = frames.slice(1).map((t, i) => t - frames[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  const spanMs = frames[frames.length - 1] - frames[0];
  const result = {
    view,
    parts: counts.parts,
    wires: counts.wires,
    seconds: Math.round(spanMs) / 1000,
    fps: Math.round(((frames.length - 1) / spanMs) * 1000 * 10) / 10,
    frameMs: { median: Math.round(pct(50) * 10) / 10, p95: Math.round(pct(95) * 10) / 10, worst: Math.round(sorted[sorted.length - 1] * 10) / 10 },
    longFrames: gaps.filter((g) => g > 25).length,
    platform: `${process.platform}-${process.arch}`,
  };
  const pass = result.parts >= 40 && result.wires >= 200 && result.fps >= 55 && result.frameMs.p95 <= 25;
  console.log(`\nLab with ${result.parts} parts and ${result.wires} wires, ${view} view, panning for ${result.seconds} s`);
  console.log(`  ${result.fps} fps · median frame ${result.frameMs.median} ms · 95th percentile ${result.frameMs.p95} ms · worst ${result.frameMs.worst} ms · ${result.longFrames} frames over 25 ms`);
  console.log(`  DSK-21 (60 fps, 95th percentile ≤ 25 ms): ${pass ? "pass" : "not met"}${useXvfb ? " (virtual display without a graphics card: not the reference PC)" : ""}\n`);
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify({ ...result, pass }, null, 2)}\n`);
} finally {
  ws.close();
  quit();
}
process.exit(0);
