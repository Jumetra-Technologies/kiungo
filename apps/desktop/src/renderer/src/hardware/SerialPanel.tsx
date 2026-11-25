import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Plug, Unplug } from "lucide-react";
import type { DetectedBoard } from "@kiungo/core/hardware/usb";
import { LineSplitter, parsePlotLine } from "@kiungo/core/hardware/plot";
import { cn } from "@kiungo/ui/cn";
import { invoke } from "../ipc";

const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000];
/** Lines kept in the monitor; older ones scroll away. */
const MAX_LINES = 2000;
/** Points per series in the plot. */
const PLOT_POINTS = 400;
const SERIES_COLORS = ["var(--primary)", "var(--warning)", "var(--success)", "var(--danger)", "#8b5cf6", "#0ea5e9"];

const ENDINGS = {
  "\n": "Newline",
  "\r\n": "Newline and carriage return",
  "": "No line ending",
} as const;
type Ending = keyof typeof ENDINGS;

export interface SerialState {
  port: string | null;
  baud: number;
  connected: boolean;
  message: string | null;
}

/**
 * The serial monitor and plotter for a board on USB (HW-02). Text from the
 * board shows as it arrives; numbers on a line can be plotted instead, read
 * the way the Arduino IDE's plotter reads them.
 */
export function SerialPanel({ port, boards }: { port: string | null; boards: DetectedBoard[] }) {
  const [baud, setBaud] = useState(9600);
  const [connected, setConnected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [view, setView] = useState<"text" | "plot">("text");
  const [series, setSeries] = useState<Map<string, number[]>>(new Map());
  const [input, setInput] = useState("");
  const [ending, setEnding] = useState<Ending>("\n");
  const [follow, setFollow] = useState(true);
  const splitter = useRef(new LineSplitter());
  const scroller = useRef<HTMLDivElement>(null);
  const plugged = port !== null && boards.some((b) => b.port === port);

  useEffect(() => {
    const offData = window.kiungo.on("serial:data", ({ port: from, text }) => {
      if (from !== connected) return;
      const whole = splitter.current.push(text);
      if (whole.length) {
        setLines((l) => {
          const next = l.concat(whole);
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
        setSeries((prev) => {
          let changed = false;
          const next = new Map(prev);
          for (const line of whole) {
            const parsed = parsePlotLine(line);
            if (!parsed) continue;
            changed = true;
            for (const { name, value } of parsed.values) {
              const values = (next.get(name) ?? []).concat(value);
              next.set(name, values.length > PLOT_POINTS ? values.slice(values.length - PLOT_POINTS) : values);
            }
          }
          return changed ? next : prev;
        });
      }
      setPartial((p) => (whole.length ? "" : p) + text.slice(text.lastIndexOf("\n") + 1));
    });
    const offClosed = window.kiungo.on("serial:closed", ({ port: from, message: why }) => {
      if (from !== connected) return;
      setConnected(null);
      setMessage(why ?? "The serial monitor stopped.");
    });
    return () => {
      offData();
      offClosed();
    };
  }, [connected]);

  // Keep the newest line in view unless the person scrolled up to read.
  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lines, partial, follow]);

  // Close when the panel goes, or the chosen port changes.
  useEffect(() => {
    return () => {
      void invoke("serial:close");
    };
  }, []);
  // Another board chosen: the monitor on the old one closes.
  const live = connected !== null && connected === port ? connected : null;
  useEffect(() => {
    if (connected && connected !== port) void invoke("serial:close");
  }, [port, connected]);

  const connect = async (speed = baud) => {
    if (!port) return;
    setMessage(null);
    splitter.current = new LineSplitter();
    const result = await invoke("serial:open", port, speed);
    if (!result.ok) return setMessage(result.message);
    setConnected(port);
  };
  const disconnect = () => {
    void invoke("serial:close");
    setConnected(null);
  };
  const send = async () => {
    if (!input) return;
    const ok = await invoke("serial:write", input + ending);
    if (!ok) return setMessage("The monitor isn't connected.");
    setLines((l) => l.concat(`→ ${input}`));
    setInput("");
  };

  const names = useMemo(() => [...series.keys()], [series]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="serial-panel">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {live ? (
          <button type="button" onClick={disconnect} className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-border px-2 text-[12px] font-medium hover:bg-muted-bg" data-testid="serial-disconnect">
            <Unplug className="size-3.5" aria-hidden />
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={!plugged}
            title={plugged ? undefined : "Pick a plugged-in board in Upload to first."}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-primary px-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            data-testid="serial-connect"
          >
            <Plug className="size-3.5" aria-hidden />
            Connect
          </button>
        )}
        <label className="flex items-center gap-1 text-[12px] text-muted">
          <span className="sr-only">Speed</span>
          <select
            value={baud}
            onChange={(e) => {
              const next = Number(e.target.value);
              setBaud(next);
              if (live) void connect(next);
            }}
            className="h-7 rounded-[7px] border border-border bg-background px-1.5 text-[12px] text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            data-testid="serial-baud"
          >
            {BAUDS.map((b) => (
              <option key={b} value={b}>
                {b} baud
              </option>
            ))}
          </select>
        </label>
        <div className="flex rounded-[7px] border border-border p-0.5" role="radiogroup" aria-label="Show as">
          {(["text", "plot"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn("h-6 rounded-[5px] px-2 text-[12px] font-medium", view === v ? "bg-muted-bg text-foreground" : "text-muted hover:text-foreground")}
              data-testid={`serial-view-${v}`}
            >
              {v === "text" ? "Text" : "Plot"}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="min-w-0 truncate text-[11.5px] text-muted" aria-live="polite">
          {live ? `Connected to ${live}` : port ? (plugged ? "Not connected" : `${port} isn't plugged in`) : "No board chosen"}
        </span>
        <button
          type="button"
          onClick={() => {
            setLines([]);
            setPartial("");
            setSeries(new Map());
          }}
          aria-label="Clear"
          title="Clear"
          className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-muted-bg hover:text-foreground"
        >
          <Eraser className="size-3.5" />
        </button>
      </div>
      {message ? (
        <p role="alert" className="shrink-0 border-b border-border px-3 py-1.5 text-[12.5px] text-danger" data-testid="serial-message">
          {message}
        </p>
      ) : null}
      {view === "text" ? (
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
          }}
          className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[12px] leading-[1.55] text-foreground"
          data-testid="serial-output"
          aria-label="What the board sent"
          role="log"
        >
          {lines.length || partial ? (
            <>
              {lines.map((line, i) => (
                <div key={i} className={line.startsWith("→ ") ? "text-primary" : undefined}>
                  {line || " "}
                </div>
              ))}
              {partial ? <div>{partial}</div> : null}
            </>
          ) : (
            <p className="font-sans text-[12.5px] text-muted">{live ? "Waiting for the board to send something. Check the speed matches Serial.begin() in the sketch." : "Connect to see what the board prints with Serial.print."}</p>
          )}
        </div>
      ) : (
        <Plot series={series} names={names} />
      )}
      <form
        className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!live}
          placeholder={live ? "Send to the board" : "Connect to send"}
          aria-label="Send to the board"
          className="h-7 min-w-0 flex-1 rounded-[7px] border border-border bg-background px-2 font-mono text-[12px] outline-none focus-visible:border-primary disabled:opacity-50"
          data-testid="serial-input"
        />
        <select
          value={ending}
          onChange={(e) => setEnding(e.target.value as Ending)}
          aria-label="Line ending"
          className="h-7 rounded-[7px] border border-border bg-background px-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          {(Object.keys(ENDINGS) as Ending[]).map((k) => (
            <option key={JSON.stringify(k)} value={k}>
              {ENDINGS[k]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!live || !input} className="h-7 rounded-[7px] border border-border px-2.5 text-[12px] font-medium hover:bg-muted-bg disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}

/** Each named value as a line, the newest on the right, on one shared scale. */
function Plot({ series, names }: { series: Map<string, number[]>; names: string[] }) {
  const all = names.flatMap((n) => series.get(n) ?? []);
  if (!all.length) {
    return <p className="flex-1 px-3 py-3 text-[12.5px] text-muted">{'Print numbers to plot them, one reading per line: Serial.println(distance); or several with names, like Serial.print("temp:"); Serial.println(t);'}</p>;
  }
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const W = 1000;
  const H = 300;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-2" data-testid="serial-plot">
      <div className="flex flex-wrap gap-3 text-[11.5px]">
        {names.map((n, i) => {
          const values = series.get(n) ?? [];
          return (
            <span key={n} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden />
              {n} <span className="tabular-nums text-muted">{values[values.length - 1]}</span>
            </span>
          );
        })}
        <span className="ml-auto tabular-nums text-muted">
          {min} to {max}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1 min-h-0 w-full flex-1" role="img" aria-label={`Plot of ${names.join(", ")}`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {names.map((n, i) => {
          const values = series.get(n) ?? [];
          const step = W / Math.max(1, PLOT_POINTS - 1);
          const offset = PLOT_POINTS - values.length;
          const d = values.map((v, j) => `${j ? "L" : "M"}${((offset + j) * step).toFixed(1)},${y(v).toFixed(1)}`).join("");
          return <path key={n} d={d} fill="none" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
    </div>
  );
}
