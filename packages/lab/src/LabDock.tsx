"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Cable, ChevronDown, ChevronUp, CircleDot, Hammer, ListChecks, Play, Radio, ScrollText, SquareTerminal, Trash2, Waves, Wrench } from "lucide-react";
import { frameAt } from "@kiungo/core/lab/simulate";
import { getPinout } from "@kiungo/core/lab/pinout";
import { HELP, runCommand, type TermLine, type TerminalApi } from "@kiungo/core/lab/terminal";
import type { LogKind } from "@kiungo/core/lab/types";
import { cn } from "@kiungo/ui/cn";
import { FaultList } from "./FaultList";
import { PartsPanel } from "./PartsPanel";
import { useLabContext } from "./lab-context";

export type DockTab = "terminal" | "activity" | "serial" | "signals" | "problems" | "parts";

const KIND_META: Record<LogKind, { icon: typeof Activity; tone: string; label: string }> = {
  session: { icon: CircleDot, tone: "text-muted", label: "Session" },
  build: { icon: Hammer, tone: "text-primary", label: "Build" },
  wire: { icon: Cable, tone: "text-[var(--lab-bus)]", label: "Wiring" },
  run: { icon: Play, tone: "text-success", label: "Run" },
  state: { icon: Activity, tone: "text-success", label: "State" },
  fault: { icon: AlertTriangle, tone: "text-danger", label: "Fault" },
  fix: { icon: Wrench, tone: "text-success", label: "Fixed" },
  note: { icon: ScrollText, tone: "text-muted", label: "Note" },
};

const FILTERS: Array<{ id: "all" | "build" | "run" | "fault"; label: string; kinds: LogKind[] }> = [
  { id: "all", label: "All", kinds: [] },
  { id: "build", label: "Build", kinds: ["build", "wire", "state"] },
  { id: "run", label: "Runs", kinds: ["run"] },
  { id: "fault", label: "Faults", kinds: ["fault", "fix"] },
];

function Terminal({ api }: { api: Omit<TerminalApi, "clear"> }) {
  const [lines, setLines] = useState<TermLine[]>([{ kind: "muted", text: "Kiungo lab terminal. Type help for commands, or try: add led" }]);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [lines]);

  const submit = () => {
    const cmd = value.trim();
    if (!cmd) return;
    let cleared = false;
    const output = runCommand(cmd, { ...api, clear: () => (cleared = true) });
    setLines((prev) => (cleared ? [] : [...prev, { kind: "in" as const, text: cmd }, ...output]).slice(-400));
    setHistory((h) => [...h.filter((x) => x !== cmd), cmd].slice(-50));
    setCursor(-1);
    setValue("");
  };

  const complete = () => {
    const word = value.trim().toLowerCase();
    if (!word || word.includes(" ")) return;
    const names = HELP.flatMap(([syntax]) => syntax.split(/ · /).map((s) => s.split(" ")[0]));
    const match = names.find((n) => n.startsWith(word));
    if (match) setValue(`${match} `);
  };

  return (
    <div className="flex h-full flex-col bg-[#0b1220] font-mono text-[12px] text-slate-200" onClick={() => input.current?.focus()} data-testid="lab-terminal">
      <div className="hhip-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {lines.map((l, i) => (
          <div key={i} className={cn("whitespace-pre-wrap break-words leading-5", l.kind === "in" ? "text-slate-400" : l.kind === "ok" ? "text-emerald-400" : l.kind === "err" ? "text-rose-400" : l.kind === "muted" ? "text-slate-500" : "text-slate-200")}>
            {l.kind === "in" ? <span className="text-sky-400">kiungo ›</span> : null} {l.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/10 px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="text-sky-400" aria-hidden>
          kiungo ›
        </span>
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && history.length) {
              e.preventDefault();
              const next = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setValue(history[next]);
            } else if (e.key === "ArrowDown" && cursor >= 0) {
              e.preventDefault();
              const next = cursor + 1;
              if (next >= history.length) {
                setCursor(-1);
                setValue("");
              } else {
                setCursor(next);
                setValue(history[next]);
              }
            } else if (e.key === "Tab") {
              e.preventDefault();
              complete();
            }
          }}
          aria-label="Terminal command"
          placeholder="help"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-[4px] bg-transparent text-slate-100 outline-none placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-cyan-400/60"
          data-testid="terminal-input"
        />
      </form>
    </div>
  );
}

function ActivityLog() {
  const { session, select, focusNode } = useLabContext();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds;
  const entries = [...session.log].reverse().filter((e) => !kinds.length || kinds.includes(e.kind));
  return (
    <div className="flex h-full flex-col" data-testid="activity-log">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-colors", filter === f.id ? "bg-foreground text-background" : "text-muted hover:bg-muted-bg hover:text-foreground")}>
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted">Saved to the project automatically</span>
      </div>
      <ol className="hhip-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {entries.map((e) => {
          const meta = KIND_META[e.kind];
          const Icon = meta.icon;
          return (
            <li key={e.id} className="flex items-start gap-2.5 py-1">
              <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.tone)} aria-hidden />
              <button
                type="button"
                disabled={!e.nodes?.length}
                onClick={() => {
                  if (e.nodes?.[0] && session.nodes.some((n) => n.id === e.nodes![0])) {
                    focusNode(e.nodes[0]);
                    select([e.nodes[0]], null);
                  }
                }}
                className="min-w-0 flex-1 text-left text-[12.5px] leading-5 text-foreground enabled:hover:text-primary"
              >
                {e.text}
              </button>
              <time className="shrink-0 font-mono text-[10.5px] text-muted" dateTime={e.at}>
                {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Serial({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (follow) end.current?.scrollIntoView?.({ block: "end" });
  }, [lines, follow]);
  return (
    <div className="flex h-full flex-col bg-[#0b1220] font-mono text-[12px]" data-testid="serial-monitor">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-1 text-[11px] text-slate-400">
        <span>115200 baud · board → computer</span>
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
        <button type="button" onClick={onClear} className="inline-flex items-center gap-1 hover:text-slate-200">
          <Trash2 className="size-3" aria-hidden /> Clear
        </button>
      </div>
      <div className="hhip-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 text-emerald-300">
        {lines.length ? lines.map((l, i) => <div key={i} className="leading-5">{l}</div>) : <p className="text-slate-500">Press Run: each board prints its readings here once a second.</p>}
        <div ref={end} />
      </div>
    </div>
  );
}

function Signals() {
  const { session, analysis, frame, running, history } = useLabContext();
  const traces = useMemo(() => {
    const list: Array<{ key: string; label: string; color: string }> = [];
    for (const node of session.nodes) {
      const report = analysis.nodes[node.id];
      if (!report || getPinout(node.partId).controller) continue;
      for (const link of report.links) {
        if (["vcc", "gnd", "load", "opt"].includes(link.role)) continue;
        const board = session.nodes.find((n) => n.id === link.board);
        const bp = board ? getPinout(board.partId).pins.find((p) => p.id === link.boardPin) : undefined;
        const pin = getPinout(node.partId).pins.find((p) => p.id === link.pin);
        list.push({ key: `${node.id}:${link.pin}`, label: `${bp?.label.split(" ")[0] ?? link.boardPin} → ${node.label} ${pin?.label ?? link.pin}`, color: link.role === "out-analog" ? "var(--lab-analog)" : link.role === "pwm" ? "var(--lab-pwm)" : ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs", "io"].includes(link.role) ? "var(--lab-bus)" : "var(--lab-digital)" });
      }
    }
    return list.slice(0, 10);
  }, [session.nodes, analysis]);

  const WINDOW = 4;
  const SAMPLES = 120;
  const samples = useMemo(() => {
    if (!traces.length) return [];
    const t1 = frame.t;
    // A program run: its recorded pin levels, resampled onto the window (the emulator can't be asked about the past).
    if (history?.length) {
      const end = history[history.length - 1].t;
      return Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const at = end - WINDOW + (i * WINDOW) / SAMPLES;
        let found = history[0];
        for (const h of history) if (h.t <= at) found = h;
        return at < history[0].t ? {} : found.pins;
      });
    }
    return Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const t = Math.max(0, t1 - WINDOW + (i * WINDOW) / SAMPLES);
      return frameAt(session.nodes, session.wires, analysis, t, running || frame.t > 0, session.inputs).pins;
    });
  }, [traces.length, frame.t, session.nodes, session.wires, session.inputs, analysis, running, history]);

  if (!traces.length) {
    return <p className="p-4 text-[13px] text-muted">Wire a part to a board to see its signals over time, like a logic analyser.</p>;
  }
  const W = 600;
  const H = 26;
  return (
    <div className="hhip-scroll h-full overflow-y-auto px-3 py-2" data-testid="signals">
      <div className="mb-1 flex justify-between pl-[11.5rem] font-mono text-[10px] text-muted">
        <span>−{WINDOW} s</span>
        <span>now {frame.t.toFixed(1)} s</span>
      </div>
      {traces.map((trace) => {
        const pts = samples.map((p, i) => {
          const v = Math.max(0, Math.min(1, p[trace.key] ?? 0));
          return `${(i / SAMPLES) * W},${H - 3 - v * (H - 6)}`;
        });
        return (
          <div key={trace.key} className="flex items-center gap-2 border-b border-border/60 py-1">
            <span className="w-44 shrink-0 truncate font-mono text-[11px] text-foreground" title={trace.label}>
              {trace.label}
            </span>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 min-w-0 flex-1 rounded bg-canvas" aria-label={`Signal trace for ${trace.label}`}>
              <polyline points={pts.join(" ")} fill="none" stroke={trace.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

export function LabDock({ tab, onTab, open, onOpen, height, onHeight, serial, onClearSerial, terminalApi }: { tab: DockTab; onTab: (t: DockTab) => void; open: boolean; onOpen: (v: boolean) => void; height: number; onHeight: (h: number) => void; serial: string[]; onClearSerial: () => void; terminalApi: Omit<TerminalApi, "clear"> }) {
  const { analysis, session } = useLabContext();
  const problems = analysis.faults.filter((f) => f.severity !== "tip").length;
  const tabs: Array<{ id: DockTab; label: string; icon: typeof Activity; count?: number }> = [
    { id: "terminal", label: "Terminal", icon: SquareTerminal },
    { id: "activity", label: "Activity", icon: ScrollText, count: session.log.length },
    { id: "serial", label: "Serial", icon: Radio },
    { id: "signals", label: "Signals", icon: Waves },
    { id: "problems", label: "Problems", icon: AlertTriangle, count: problems },
    { id: "parts", label: "Parts", icon: ListChecks },
  ];

  const startResize = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => onHeight(Math.max(140, Math.min(window.innerHeight * 0.6, startH + startY - ev.clientY)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="relative flex shrink-0 flex-col border-t border-border bg-surface" style={{ height: open ? height : 40 }} data-testid="lab-dock">
      {open ? <div role="separator" aria-orientation="horizontal" aria-label="Resize panel" onPointerDown={startResize} className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize hover:bg-primary/20" /> : null}
      <div role="tablist" aria-label="Lab panels" className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto px-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const selected = open && tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                if (selected) onOpen(false);
                else {
                  onTab(t.id);
                  onOpen(true);
                }
              }}
              className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors", selected ? "bg-muted-bg text-foreground" : "text-muted hover:bg-muted-bg/60 hover:text-foreground")}
            >
              <Icon className={cn("size-3.5", t.id === "problems" && problems ? "text-danger" : "")} aria-hidden />
              {t.label}
              {t.count ? <span className={cn("rounded-full px-1.5 text-[10.5px] tabular-nums", t.id === "problems" ? "bg-danger/12 text-danger" : "bg-muted-bg text-muted")}>{t.count}</span> : null}
            </button>
          );
        })}
        <button type="button" onClick={() => onOpen(!open)} aria-label={open ? "Collapse panel" : "Expand panel"} className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground">
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>
      {/* Kept mounted while collapsed so the terminal keeps its history. */}
      <div role="tabpanel" className={cn("min-h-0 flex-1 border-t border-border", !open && "hidden")}>
          <div className={cn("h-full", tab !== "terminal" && "hidden")}>
            <Terminal api={terminalApi} />
          </div>
          {tab === "activity" ? <ActivityLog /> : null}
          {tab === "serial" ? <Serial lines={serial} onClear={onClearSerial} /> : null}
          {tab === "signals" ? <Signals /> : null}
          {tab === "parts" ? <PartsPanel fileName={session.name} /> : null}
          {tab === "problems" ? (
            <div className="hhip-scroll h-full overflow-y-auto p-3">
              <FaultList faults={analysis.faults} />
            </div>
          ) : null}
      </div>
    </div>
  );
}
