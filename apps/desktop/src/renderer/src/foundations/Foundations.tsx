import { useEffect, useState } from "react";
import "./foundations.css";
import type { AppInfo, CompileResult, InstallResult, StartupMetrics, ToolchainStatus } from "@kiungo/api";
import markUrl from "@kiungo/ui/assets/kiungo-mark.svg";
import blinkHex from "./assets/blink-uno.hex?raw";
import { UnoBoard } from "./UnoBoard";
import { useEmulator } from "./useEmulator";

type Program = { label: string; hex: string; origin: "bundled" | "compiled" };

const BUNDLED: Program = { label: "Blink (compiled ahead, bundled)", hex: blinkHex, origin: "bundled" };

function fmtMs(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="num">
          {used.toLocaleString("en-US")} of {max.toLocaleString("en-US")} bytes
        </span>
      </div>
      <div className="meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li className="check">
      <span className={`dot ${ok === null ? "wait" : ok ? "ok" : "bad"}`} aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** Sprint 1's Foundations check, kept as a diagnostics screen: the toolchain, the emulator and this computer. */
export function Foundations({ onHome }: { onHome: () => void }) {
  const { state, levels, load, start, stop } = useEmulator([13]);
  const [program, setProgram] = useState<Program>(BUNDLED);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [metrics, setMetrics] = useState<StartupMetrics | null>(null);
  const [toolchain, setToolchain] = useState<ToolchainStatus | null>(null);
  const [compile, setCompile] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [install, setInstall] = useState<InstallResult | null>(null);
  const isolated = self.crossOriginIsolated;

  useEffect(() => {
    void window.kiungo.invoke("app:info").then(setInfo);
    void window.kiungo.invoke("toolchain:status").then(setToolchain);
    const t = setTimeout(() => void window.kiungo.invoke("app:metrics").then(setMetrics), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => load(program.hex, "uno"), [program, load]);

  const compileBlink = async () => {
    setCompiling(true);
    setCompile(null);
    try {
      const result = await window.kiungo.invoke("toolchain:compile-example", "Blink", "uno");
      setCompile(result);
      if (result.ok && result.hex) setProgram({ label: "Blink (compiled on this computer)", hex: result.hex, origin: "compiled" });
    } finally {
      setCompiling(false);
    }
  };

  const installAvr = async () => {
    setInstalling(true);
    setInstall(null);
    try {
      const result = await window.kiungo.invoke("toolchain:install-core", "arduino:avr@1.8.6");
      setInstall(result);
      setToolchain(await window.kiungo.invoke("toolchain:status"));
    } finally {
      setInstalling(false);
    }
  };

  const led = levels[13] === "high";
  const cliFound = toolchain?.cli.found ?? null;
  const avrCore = toolchain?.cores.find((c) => c.id === "arduino:avr");

  return (
    <div className="foundations">
    <div className="shell">
      <header className="topbar">
        <button type="button" className="btn ghost" onClick={onHome}>
          Home
        </button>
        <img src={markUrl} alt="" className="mark" />
        <span className="brand">Kiungo</span>
        <span className="spacer" />
        <span className="muted small">{info ? `v${info.appVersion}` : ""}</span>
      </header>

      <main className="page">
        <section className="intro">
          <h1>Foundations check</h1>
          <p className="lead">Checks the pieces Kiungo runs on: compiled code on an emulated Uno, the Arduino toolchain on this computer, and the app itself.</p>
        </section>

        <div className="grid">
          <section className="card wide" aria-labelledby="emu-title">
            <div className="card-head">
              <h2 id="emu-title">Your code on an emulated Uno</h2>
              <span className={`status ${state.running ? "on" : ""}`}>{state.running ? "Running" : state.loaded ? "Ready" : "Loading"}</span>
            </div>
            <div className="emu">
              <UnoBoard ledOn={led} />
              <div className="emu-side">
                <div className="program">
                  <span className="label">Program</span>
                  <span>{program.label}</span>
                </div>
                <div className="actions">
                  {state.running ? (
                    <button className="btn" onClick={stop}>
                      Stop
                    </button>
                  ) : (
                    <button className="btn primary" onClick={start} disabled={!state.loaded}>
                      Run
                    </button>
                  )}
                  {program.origin === "compiled" && (
                    <button className="btn ghost" onClick={() => setProgram(BUNDLED)}>
                      Use the bundled Blink
                    </button>
                  )}
                </div>
                <dl className="stats">
                  <div>
                    <dt>Speed</dt>
                    <dd className="num">{state.running ? `${state.speedPercent} % of real time` : "Stopped"}</dd>
                  </div>
                  <div>
                    <dt>Simulated time</dt>
                    <dd className="num">{fmtMs(state.simMs)}</dd>
                  </div>
                  <div>
                    <dt>Pin 13 (LED)</dt>
                    <dd>{levels[13] === "high" ? "HIGH" : levels[13] === "low" ? "LOW" : "Not set yet"}</dd>
                  </div>
                  <div>
                    <dt>Program size</dt>
                    <dd className="num">{state.programBytes ? `${state.programBytes.toLocaleString("en-US")} bytes` : "None"}</dd>
                  </div>
                </dl>
                {state.error && <p className="error">{state.error}</p>}
              </div>
            </div>
            <p className="note">The board runs in a background worker with the Uno&apos;s real 32 KB of flash and 2 KB of RAM. Pin levels reach this window through {state.sharedPins ? "shared memory" : "messages"}.</p>
          </section>

          <section className="card" aria-labelledby="cli-title">
            <div className="card-head">
              <h2 id="cli-title">Arduino toolchain</h2>
            </div>
            <ul className="checks">
              <Check ok={cliFound}>{toolchain === null ? "Looking for Arduino CLI…" : toolchain.cli.found ? `Arduino CLI ${toolchain.cli.version}` : toolchain.cli.hint}</Check>
              <Check ok={toolchain === null ? null : Boolean(avrCore)}>{avrCore ? `Uno and Nano core ${avrCore.version}` : "Uno and Nano core not installed"}</Check>
            </ul>
            {cliFound && toolchain && !avrCore && (
              <div className="compile">
                <p className="muted small">The Uno and Nano compiler downloads once, then works offline.</p>
                <button className="btn" onClick={installAvr} disabled={installing}>
                  {installing ? "Installing, this can take a few minutes…" : "Install the Uno and Nano core"}
                </button>
                {install && !install.ok && (
                  <details open>
                    <summary>The install failed</summary>
                    <pre className="log">{install.log || "No output."}</pre>
                  </details>
                )}
              </div>
            )}
            <button className="btn primary" onClick={compileBlink} disabled={!cliFound || !avrCore || compiling}>
              {compiling ? "Compiling…" : "Compile Blink on this computer"}
            </button>
            {compile && (
              <div className="compile">
                {compile.ok ? (
                  <>
                    <p className="ok-line">Compiled in {(compile.durationMs / 1000).toFixed(1)} s and loaded into the emulator.</p>
                    {compile.flash && <Meter label="Flash" used={compile.flash.used} max={compile.flash.max} />}
                    {compile.ram && <Meter label="RAM" used={compile.ram.used} max={compile.ram.max} />}
                  </>
                ) : (
                  <p className="error">The build failed.</p>
                )}
                <details>
                  <summary>Build output</summary>
                  <pre className="log">{compile.log || "No output."}</pre>
                </details>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="sys-title">
            <div className="card-head">
              <h2 id="sys-title">This computer</h2>
            </div>
            <ul className="checks">
              <Check ok={isolated}>{isolated ? "Shared memory available (cross-origin isolated)" : "Shared memory unavailable"}</Check>
              <Check ok={info ? true : null}>{info ? `Electron ${info.versions.electron}, Chromium ${info.versions.chrome.split(".")[0]}` : "Reading versions…"}</Check>
            </ul>
            <dl className="stats two">
              <div>
                <dt>System</dt>
                <dd>{info ? `${{ win32: "Windows", linux: "Linux", darwin: "macOS" }[info.platform] ?? info.platform} (${info.arch})` : "…"}</dd>
              </div>
              <div>
                <dt>Start to window</dt>
                <dd className="num">{metrics?.toWindowShownMs != null ? `${(metrics.toWindowShownMs / 1000).toFixed(2)} s` : "…"}</dd>
              </div>
              <div>
                <dt>App memory, all processes</dt>
                <dd className="num">{metrics ? `${metrics.totalMb} MB` : "…"}</dd>
              </div>
            </dl>
          </section>
        </div>
      </main>
    </div>
    </div>
  );
}
