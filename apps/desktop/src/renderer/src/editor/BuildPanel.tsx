import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Package, Plus, Search, Trash2, Wand2, X } from "lucide-react";
import type { BuildResult, LibraryInfo, UploadResult } from "@kiungo/api";
import { hardwareBoard, type HardwareBoardId } from "@kiungo/core/hardware/boards";
import type { DetectedBoard } from "@kiungo/core/hardware/usb";
import { applyEdits, explain, libraryForHeader, quickFix, type Diagnostic, type ProfileLibrary, type QuickFix } from "@kiungo/core/build";
import { cn } from "@kiungo/ui/cn";
import { SerialPanel } from "../hardware/SerialPanel";
import { invoke } from "../ipc";

export type BuildTab = "problems" | "libraries" | "output" | "serial";

export interface UploadState {
  status: "idle" | "building" | "uploading" | "done";
  result: UploadResult | null;
  target: { port: string; board: HardwareBoardId } | null;
}

export interface BuildState {
  status: "idle" | "building" | "done";
  /** Seconds the current build has run, so a slow first build can say why. */
  slow: boolean;
  result: BuildResult | null;
  /** Files edited since the build: their problems may have moved, so they offer no fixes. */
  changed: Set<string>;
}

interface BuildPanelProps {
  projectPath: string;
  board: string;
  state: BuildState;
  tab: BuildTab;
  onTab: (tab: BuildTab) => void;
  onClose: () => void;
  /** Show the problem's line in the editor. */
  onReveal: (d: Diagnostic) => void;
  /** The text of a sketch file now, for fixes. */
  sourceOf: (file: string) => string | null;
  /** Make the fix in the editor, as one undo step. */
  onApplyFix: (fix: QuickFix) => void;
  /** Libraries changed: build again. */
  onLibrariesChanged: () => void;
  upload: UploadState;
  /** Upload again, as another board (the Nano's old bootloader). */
  onRetryUpload: (as?: HardwareBoardId) => void;
  /** The chosen board's port, if it's plugged in: where the serial monitor connects. */
  serialPort: string | null;
  boards: DetectedBoard[];
}

/** How the last upload went (BLD-06): done, or what to try. */
function UploadCard({ upload, onRetry }: { upload: UploadState; onRetry: (as?: HardwareBoardId) => void }) {
  const target = upload.target;
  const name = target ? (hardwareBoard(target.board)?.name ?? target.board) : "";
  if (upload.status === "building" || upload.status === "uploading") {
    return (
      <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12.5px] text-foreground" aria-live="polite" data-testid="upload-status">
        <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
        {upload.status === "building" ? `Building for the ${name}…` : `Uploading to the ${name} on ${target?.port}…`}
      </p>
    );
  }
  const result = upload.result;
  if (!result || result.stage === "build") return null;
  if (result.ok) {
    return (
      <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12.5px] text-foreground" aria-live="polite" data-testid="upload-status">
        <CheckCircle2 className="size-3.5 text-success" aria-hidden />
        {`Uploaded to the ${name} on ${target?.port} in ${(result.durationMs / 1000).toFixed(1)} s. It's running now.${result.monitorReopened ? " The serial monitor reconnected." : ""}`}
      </p>
    );
  }
  const problem = result.problem;
  const retry = problem?.retryWith ? hardwareBoard(problem.retryWith) : undefined;
  return (
    <div role="alert" className="border-b border-border bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))] px-3 py-2.5" data-testid="upload-problem">
      <p className="flex items-start gap-2 text-[13px] font-medium text-foreground">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
        {problem?.title ?? "The upload didn't work"}
      </p>
      {problem?.steps.length ? (
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-9 text-[12.5px] leading-[1.5] text-foreground">
          {problem.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      <div className="mt-2 flex gap-2 pl-5">
        {retry ? (
          <button type="button" onClick={() => onRetry(retry.id)} className="h-7 rounded-[7px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:opacity-90" data-testid="upload-retry-as">
            Upload as {retry.name}
          </button>
        ) : null}
        <button type="button" onClick={() => onRetry()} className="h-7 rounded-[7px] border border-border px-2.5 text-[12px] font-medium hover:bg-muted-bg" data-testid="upload-retry">
          Try again
        </button>
      </div>
    </div>
  );
}

const bytes = (n: number) => n.toLocaleString("en-US");

/**
 * How much of a memory the program uses. For a Hybrid build, `kiungo` is the
 * part Kiungo's layer adds (HWT-02, HWT-04): drawn apart at the end of the
 * bar, so what the program needs alone stays readable (HWT-03).
 */
function Meter({ label, used, max, kiungo = 0, testId }: { label: string; used: number; max: number; kiungo?: number; testId: string }) {
  const share = max > 0 ? used / max : 0;
  const own = Math.max(0, used - kiungo);
  const tone = share > 1 ? "bg-danger" : share > 0.85 ? "bg-warning" : "bg-primary";
  const pct = (n: number) => `${Math.min(100, max > 0 ? (n / max) * 100 : 0)}%`;
  return (
    <div className="min-w-0 flex-1" data-testid={testId} title={kiungo ? `Your program ${bytes(own)} + Kiungo's Hybrid layer ${bytes(kiungo)} of ${bytes(max)} bytes` : `${bytes(used)} of ${bytes(max)} bytes`}>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted">
          {kiungo ? (
            <>
              {bytes(own)} + <span data-testid={`${testId}-kiungo`}>{bytes(kiungo)}</span> Kiungo / {bytes(max)} B
            </>
          ) : (
            <>
              {bytes(used)} / {bytes(max)} B · {Math.round(share * 100)}%
            </>
          )}
        </span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted-bg" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
        <div className={cn("h-full", tone)} style={{ width: pct(own) }} />
        {kiungo ? <div className="h-full bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_2px,transparent_2px_4px)]" style={{ width: pct(kiungo) }} /> : null}
      </div>
    </div>
  );
}

/** The lines a fix changes, with a line of context each side, for the preview (FIX-01). */
export function fixPreview(source: string, fix: QuickFix): Array<{ kind: " " | "-" | "+"; line: number; text: string }> {
  const before = source.split("\n");
  const after = applyEdits(source, fix.edits).split("\n");
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const from = Math.max(0, start - 1);
  const rows: Array<{ kind: " " | "-" | "+"; line: number; text: string }> = [];
  for (let i = from; i < start; i++) rows.push({ kind: " ", line: i + 1, text: before[i] });
  for (let i = start; i < before.length - end; i++) rows.push({ kind: "-", line: i + 1, text: before[i] });
  for (let i = start; i < after.length - end; i++) rows.push({ kind: "+", line: i + 1, text: after[i] });
  if (end > 0) rows.push({ kind: " ", line: after.length - end + 1, text: after[after.length - end] });
  return rows;
}

function ProblemRow({
  d,
  board,
  stale,
  sourceOf,
  onReveal,
  onApplyFix,
  onAddLibrary,
  adding,
  all,
}: {
  d: Diagnostic;
  board: string;
  stale: boolean;
  sourceOf: (file: string) => string | null;
  onReveal: (d: Diagnostic) => void;
  onApplyFix: (fix: QuickFix) => void;
  onAddLibrary: (name: string) => void;
  adding: string | null;
  all: Diagnostic[];
}) {
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const why = explain(d, board);
  const source = d.file ? sourceOf(d.file) : null;
  const fix = !stale && source !== null ? quickFix(d, source, all) : null;
  const library = why?.header ? libraryForHeader(why.header) : null;
  const where = d.file ? `${d.file}:${d.line}` : "When linking";
  const Icon = d.severity === "error" ? AlertCircle : AlertTriangle;

  return (
    <li className="border-b border-border last:border-b-0" data-testid="problem">
      <div className="flex items-start gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide details" : "Show details"} className="mt-0.5 text-muted hover:text-foreground">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <Icon className={cn("mt-0.5 size-3.5 shrink-0", d.severity === "error" ? "text-danger" : "text-warning")} aria-label={d.severity} />
        <button type="button" onClick={() => onReveal(d)} disabled={!d.file} className="min-w-0 flex-1 text-left disabled:cursor-default">
          <span className="block text-[12.5px] text-foreground">{why?.title ?? d.message}</span>
          <span className="block font-mono text-[11px] text-muted">
            {where}
            {stale ? " · changed since the build" : ""}
          </span>
        </button>
        {library ? (
          <button
            type="button"
            onClick={() => onAddLibrary(library.name)}
            disabled={adding !== null}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] bg-primary px-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            data-testid="problem-add-library"
          >
            {adding === library.name ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            Add {library.name}
          </button>
        ) : fix ? (
          <button
            type="button"
            onClick={() => setPreviewing((p) => !p)}
            aria-expanded={previewing}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] border border-border px-2 text-[12px] font-medium text-foreground hover:bg-muted-bg"
            data-testid="problem-fix"
          >
            <Wand2 className="size-3.5" aria-hidden />
            Fix
          </button>
        ) : null}
      </div>
      {previewing && fix && source !== null ? (
        <div className="mx-3 mb-2 overflow-hidden rounded-[8px] border border-border" data-testid="fix-preview">
          <p className="border-b border-border bg-muted-bg px-2 py-1 text-[12px] text-foreground">{fix.title}</p>
          <div className="overflow-x-auto font-mono text-[11.5px] leading-[18px]" data-native-scrollbar>
            {fixPreview(source, fix).map((row, i) => (
              <div key={i} className={cn("whitespace-pre px-2", row.kind === "-" ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" : row.kind === "+" ? "bg-[color-mix(in_srgb,var(--success)_12%,transparent)]" : "text-muted")}>
                <span className="select-none text-muted">{`${String(row.line).padStart(4)} ${row.kind === " " ? " " : row.kind === "-" ? "−" : "+"} `}</span>
                {row.text}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-1.5 border-t border-border px-2 py-1.5">
            <button type="button" onClick={() => setPreviewing(false)} className="h-7 rounded-[7px] px-2 text-[12px] text-muted hover:bg-muted-bg">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyFix(fix);
                setPreviewing(false);
              }}
              className="h-7 rounded-[7px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
              data-testid="fix-apply"
            >
              Make this change
            </button>
          </div>
        </div>
      ) : null}
      {open ? (
        <div className="px-3 pb-2 pl-[52px] text-[12.5px] leading-[1.5] text-muted">
          {why ? <p className="text-foreground">{why.text}</p> : null}
          {library ? <p className="mt-1">{library.does}. Adding it pins the newest version in this sketch; the first build after needs the internet.</p> : null}
          <p className="mt-1 font-mono text-[11.5px]">
            The compiler said: {d.message}
            {d.notes.map((n, i) => (
              <span key={i} className="block">
                {n.file ? `${n.file}:${n.line}: ` : ""}
                {n.message}
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function LibrariesTab({ projectPath, onChanged }: { projectPath: string; onChanged: () => void }) {
  const [pinned, setPinned] = useState<ProfileLibrary[] | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<LibraryInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    let live = true;
    void invoke("libraries:list", projectPath).then((l) => live && setPinned(l));
    return () => {
      live = false;
    };
  }, [projectPath]);

  const search = async (q: string) => {
    const seq = ++searchSeq.current;
    setBusy("search");
    setMessage(null);
    const result = await invoke("libraries:search", q).catch(() => ({ ok: false as const, message: "The library search didn't work. Try again." }));
    if (seq !== searchSeq.current) return;
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    setFound(result.libraries);
  };

  const change = async (name: string, action: "add" | "remove", version?: string) => {
    setBusy(name);
    setMessage(null);
    const result = action === "add" ? await invoke("libraries:add", projectPath, name, version) : await invoke("libraries:remove", projectPath, name);
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    setPinned(result.libraries);
    onChanged();
  };

  const has = (name: string) => pinned?.some((l) => l.name.toLowerCase() === name.toLowerCase());

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="libraries">
      <form
        className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void search(query);
        }}
      >
        <Search className="size-3.5 text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a library: servo, lcd, neopixel"
          aria-label="Find a library"
          className="h-7 min-w-0 flex-1 rounded-[6px] bg-transparent px-1 text-[12.5px] outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_40%,transparent)]"
          data-testid="library-search"
        />
        {busy === "search" ? <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Searching" /> : null}
      </form>
      {message ? (
        <p role="alert" className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2 text-[12.5px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {found ? (
          <ul aria-label="Search results">
            {found.length === 0 ? <li className="px-3 py-3 text-[12.5px] text-muted">No library for AVR boards matches “{query}”.</li> : null}
            {found.map((lib) => (
              <li key={lib.name} className="flex items-start gap-2 border-b border-border px-3 py-2" data-testid="library-result">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] text-foreground">
                    {lib.name} <span className="text-muted">{lib.version}</span>
                  </p>
                  <p className="truncate text-[11.5px] text-muted" title={lib.sentence}>
                    {lib.sentence || lib.author}
                  </p>
                </div>
                {has(lib.name) ? (
                  <span className="h-7 shrink-0 px-2 text-[12px] leading-7 text-muted">Added</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void change(lib.name, "add", lib.version)}
                    disabled={busy !== null}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] border border-border px-2 text-[12px] font-medium hover:bg-muted-bg disabled:opacity-50"
                  >
                    {busy === lib.name ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <ul aria-label="Libraries in this sketch">
          {pinned && pinned.length === 0 && !found ? <li className="px-3 py-3 text-[12.5px] text-muted">This sketch uses no extra libraries. Find one above, or build: a missing library shows up as a problem you can add in one click.</li> : null}
          {(found ? [] : (pinned ?? [])).map((lib) => (
            <li key={lib.name} className="flex items-center gap-2 border-b border-border px-3 py-2" data-testid="library-pinned">
              <Package className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                {lib.name} <span className="text-muted">{lib.version}</span>
                {lib.dependency ? <span className="ml-1.5 text-[11.5px] text-muted">needed by another library</span> : null}
              </span>
              {lib.dependency ? null : (
                <button
                  type="button"
                  onClick={() => void change(lib.name, "remove")}
                  disabled={busy !== null}
                  aria-label={`Remove ${lib.name}`}
                  title="Remove from this sketch"
                  className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-muted-bg hover:text-danger disabled:opacity-50"
                >
                  {busy === lib.name ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              )}
            </li>
          ))}
        </ul>
        {found ? (
          <button type="button" onClick={() => setFound(null)} className="px-3 py-2 text-[12px] font-medium text-primary">
            {"Back to this sketch's libraries"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Under the code: the last build's problems, the sketch's libraries and the build log (EDT-05, BLD-02, BLD-04). */
export function BuildPanel({ projectPath, board, state, tab, onTab, onClose, onReveal, sourceOf, onApplyFix, onLibrariesChanged, upload, onRetryUpload, serialPort, boards }: BuildPanelProps) {
  const [adding, setAdding] = useState<string | null>(null);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const result = state.result;
  const diagnostics = useMemo(() => result?.diagnostics ?? [], [result]);
  const errors = diagnostics.filter((d) => d.severity === "error").length;

  const addLibrary = async (name: string) => {
    setAdding(name);
    setAddMessage(null);
    const change = await invoke("libraries:add", projectPath, name);
    setAdding(null);
    if (!change.ok) return setAddMessage(change.message);
    onLibrariesChanged();
  };

  const tabButton = (id: BuildTab, label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => onTab(id)}
      className={cn("h-full shrink-0 whitespace-nowrap border-b-2 px-2.5 text-[12px] font-medium", tab === id ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground")}
      data-testid={`build-tab-${id}`}
    >
      {label}
      {count ? <span className={cn("ml-1.5 rounded-full px-1.5 text-[10.5px]", errors ? "bg-danger text-danger-foreground" : "bg-muted-bg text-muted")}>{count}</span> : null}
    </button>
  );

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-border bg-surface" aria-label="Build" data-testid="build-panel">
      <div className="flex h-9 shrink-0 items-stretch border-b border-border px-1" role="tablist" aria-label="Build">
        {tabButton("problems", "Code problems", diagnostics.length)}
        {tabButton("libraries", "Libraries")}
        {tabButton("output", "Build log")}
        {tabButton("serial", "Serial monitor")}
        <span className="min-w-2 flex-1" />
        {/* In a narrow Code pane the tabs come first; the outcome is still read out, and shown as the problems count. */}
        <span className="flex min-w-0 items-center whitespace-nowrap px-2 text-[11.5px] text-muted @max-[620px]:sr-only" aria-live="polite" data-testid="build-status">
          {state.status === "building" ? (
            <>
              <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
              {state.slow ? "Building. The first build downloads the board package and libraries" : "Building"}
            </>
          ) : result ? (
            result.ok ? (
              `Built in ${(result.durationMs / 1000).toFixed(1)} s`
            ) : errors ? (
              `${errors} ${errors === 1 ? "problem stops" : "problems stop"} the build`
            ) : (
              "Didn't build"
            )
          ) : null}
        </span>
        <button type="button" onClick={onClose} aria-label="Hide the build panel" className="my-auto flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-muted-bg hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      {result?.flash && result.ram && (tab === "problems" || tab === "output") ? (
        <div className="flex shrink-0 gap-4 border-b border-border px-3 py-2" aria-label="Memory the program uses">
          <Meter label="Program (flash)" used={result.flash.used} max={result.flash.max} kiungo={result.overhead?.flash} testId="meter-flash" />
          <Meter label="Variables (RAM)" used={result.ram.used} max={result.ram.max} kiungo={result.overhead?.ram} testId="meter-ram" />
        </div>
      ) : null}
      {result?.overhead && result.ship && (tab === "problems" || tab === "output") ? (
        <p className="shrink-0 border-b border-border px-3 py-1.5 text-[11.5px] text-muted" data-testid="hybrid-note">
          A Hybrid build: Kiungo&apos;s layer, striped, lets the lab play the virtual parts. Without it your program uses {bytes(result.ship.flash.used)} bytes of program and {bytes(result.ship.ram.used)} of RAM, which is what the board runs when you upload it.
        </p>
      ) : null}

      {tab === "problems" ? (
        <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel" aria-label="Problems">
          <UploadCard upload={upload} onRetry={onRetryUpload} />
          {result?.message ? (
            <p role="alert" className="flex items-start gap-2 border-b border-border px-3 py-2 text-[12.5px] text-danger" data-testid="build-message">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {result.message}
            </p>
          ) : null}
          {addMessage ? (
            <p role="alert" className="flex items-start gap-2 border-b border-border px-3 py-2 text-[12.5px] text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {addMessage}
            </p>
          ) : null}
          {diagnostics.length ? (
            <ul>
              {diagnostics.map((d, i) => (
                <ProblemRow
                  key={`${d.file}:${d.line}:${d.column}:${i}`}
                  d={d}
                  all={diagnostics}
                  board={board}
                  stale={d.file ? state.changed.has(d.file) : false}
                  sourceOf={sourceOf}
                  onReveal={onReveal}
                  onApplyFix={onApplyFix}
                  onAddLibrary={(n) => void addLibrary(n)}
                  adding={adding}
                />
              ))}
            </ul>
          ) : result && !result.message ? (
            <p className="px-3 py-3 text-[12.5px] text-muted">No problems.</p>
          ) : !result && state.status !== "building" ? (
            <p className="px-3 py-3 text-[12.5px] text-muted">Build to check the code: problems show here and on their line.</p>
          ) : null}
        </div>
      ) : tab === "libraries" ? (
        <LibrariesTab projectPath={projectPath} onChanged={onLibrariesChanged} />
      ) : tab === "output" ? (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11.5px] leading-[1.5] text-muted" role="tabpanel" aria-label="Build log" data-testid="build-log">
          {[result?.log, upload.result?.stage === "upload" ? upload.result.log : ""].filter(Boolean).join("\n\n") || (state.status === "building" ? "Building…" : "Nothing built yet.")}
        </pre>
      ) : null}
      {/* Kept mounted, so switching tabs doesn't disconnect the monitor. */}
      <div className={cn("min-h-0 flex-1 flex-col", tab === "serial" ? "flex" : "hidden")} role="tabpanel" aria-label="Serial monitor">
        <SerialPanel port={serialPort} boards={boards} />
      </div>
    </section>
  );
}
