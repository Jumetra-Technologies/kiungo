import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Check, FilePlus2, Hammer, Loader2, MoreHorizontal, Play, Search, Square, Upload, X } from "lucide-react";
import type { BuildResult, SketchFile, UploadResult } from "@kiungo/api";
import type { EditorBridge } from "../project/program";
import { uploadTargetsFor, type HardwareBoardId } from "@kiungo/core/hardware/boards";
import { explain, type Diagnostic, type QuickFix } from "@kiungo/core/build";
import { cn } from "@kiungo/ui/cn";
import { Menu } from "@kiungo/ui/menu";
import { invoke, shortcut } from "../ipc";
import { BoardHelp } from "../hardware/BoardHelp";
import { suggestTarget, UploadPicker, type UploadTarget } from "../hardware/UploadPicker";
import { useBoards } from "../hardware/useBoards";
import { BuildPanel, type BuildState, type BuildTab, type UploadState } from "./BuildPanel";
import { languageFor, monaco } from "./monaco";

const MARKERS = "kiungo-build";
/** After this long a build says the first one downloads the board package and libraries. */
const SLOW_BUILD_MS = 4000;

/** The build's problems as editor markers, on the file they belong to (ERR-01). */
function markersFor(diagnostics: readonly Diagnostic[], file: string, board: string): monaco.editor.IMarkerData[] {
  return diagnostics
    .filter((d) => d.file === file && d.line > 0)
    .map((d) => {
      const why = explain(d, board);
      return {
        severity: d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: why ? `${why.title}\n${why.text}` : d.message,
        source: why ? `The compiler said: ${d.message}` : undefined,
        startLineNumber: d.line,
        startColumn: Math.max(1, d.column),
        endLineNumber: d.line,
        // GCC gives where a problem starts; mark to the end of the word there.
        endColumn: Math.max(1, d.column) + 1,
      };
    });
}

type SaveState = { state: "saved" | "saving" | "error"; message?: string };

/** One open file. Monaco's model lives outside React; what the screen shows is in `status`. */
interface OpenFile {
  name: string;
  model: monaco.editor.ITextModel;
  view: monaco.editor.ICodeEditorViewState | null;
  /** The text last written to disk. */
  saved: string;
  timer?: ReturnType<typeof setTimeout>;
  writing: boolean;
}

/** Saves follow typing by this much (EDT-04); switching file, leaving the editor or closing saves at once. */
const SAVE_DELAY_MS = 400;

/** Write a file's text if it changed, then again if more was typed meanwhile. */
async function writeFile(projectPath: string, file: OpenFile, report: (name: string, s: SaveState) => void): Promise<void> {
  if (file.timer) clearTimeout(file.timer);
  file.timer = undefined;
  if (file.writing) {
    file.timer = setTimeout(() => void writeFile(projectPath, file, report), SAVE_DELAY_MS);
    return;
  }
  const text = file.model.isDisposed() ? file.saved : file.model.getValue();
  if (text === file.saved) {
    report(file.name, { state: "saved" });
    return;
  }
  file.writing = true;
  report(file.name, { state: "saving" });
  const result = await invoke("sketch:write", projectPath, file.name, text).catch(() => ({ ok: false as const, message: `Couldn't save ${file.name}.` }));
  file.writing = false;
  if (!result.ok) {
    report(file.name, { state: "error", message: result.message });
    return;
  }
  file.saved = text;
  if (!file.model.isDisposed() && file.model.getValue() !== text) await writeFile(projectPath, file, report);
  else report(file.name, { state: "saved" });
}

interface EditorPaneProps {
  projectPath: string;
  /** The board's name, for explanations: "the Arduino Uno". */
  board: string;
  /** The lab part the project is written for ("arduino-uno"): which boards it can upload to. */
  boardPart: string;
  /** Lets the lab's Run save the files and show its build's problems here. */
  bridge?: { current: EditorBridge | null };
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  onClose: () => void;
}

/** Code beside the circuit (DSK-30, EDT-01 to EDT-03, EDT-06): the sketch's files in tabs, saved as you type. */
/** The board last uploaded to, per project, so it's chosen again next time. */
const targetKey = (projectPath: string) => `kiungo.desktop.upload:${projectPath}`;
function savedTarget(projectPath: string): UploadTarget | null {
  try {
    const raw = JSON.parse(localStorage.getItem(targetKey(projectPath)) ?? "null") as UploadTarget | null;
    return raw && typeof raw.port === "string" && typeof raw.board === "string" ? raw : null;
  } catch {
    return null;
  }
}

export function EditorPane({ projectPath, board, boardPart, bridge, running, onRun, onStop, onClose }: EditorPaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const files = useRef(new Map<string, OpenFile>());
  // The editor's Ctrl+Enter command is made once; it reads the current Run or Stop through this.
  const runRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    runRef.current = running ? onStop : onRun;
  }, [running, onRun, onStop]);
  const [list, setList] = useState<SketchFile[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ mode: "new" } | { mode: "rename"; from: string } | null>(null);
  const [build, setBuild] = useState<BuildState>({ status: "idle", slow: false, result: null, changed: new Set() });
  const [panel, setPanel] = useState<{ open: boolean; tab: BuildTab }>({ open: false, tab: "problems" });
  /** The last build's problems, for files opened after it. */
  const diagnostics = useRef<Diagnostic[]>([]);
  const buildRef = useRef<() => void>(() => undefined);
  const uploadRef = useRef<() => void>(() => undefined);
  const boards = useBoards();
  const targets = useMemo(() => uploadTargetsFor(boardPart), [boardPart]);
  const [target, setTarget] = useState<UploadTarget | null>(() => savedTarget(projectPath));
  const [upload, setUpload] = useState<UploadState>({ status: "idle", result: null, target: null });
  const [helpOpen, setHelpOpen] = useState(false);

  const chooseTarget = useCallback(
    (next: UploadTarget) => {
      setTarget(next);
      try {
        localStorage.setItem(targetKey(projectPath), JSON.stringify(next));
      } catch {
        // Remembering the board is a convenience.
      }
    },
    [projectPath],
  );

  // Plugged in and nothing chosen (or the chosen one is gone): suggest the first board.
  useEffect(() => {
    const list = boards?.boards ?? [];
    if (!list.length) return;
    if (target && list.some((b) => b.port === target.port)) return;
    const first = list.find((b) => suggestTarget(b, targets)) ?? list[0];
    const suggested = suggestTarget(first, targets);
    if (suggested) setTarget({ port: first.port, board: suggested });
  }, [boards, target, targets]);

  const report = useCallback((name: string, s: SaveState) => setStatus((all) => (all[name]?.state === s.state && all[name]?.message === s.message ? all : { ...all, [name]: s })), []);
  const save = useCallback((file: OpenFile) => writeFile(projectPath, file, report), [projectPath, report]);
  const saveAll = useCallback(() => {
    for (const file of files.current.values()) if (file.timer || (!file.model.isDisposed() && file.model.getValue() !== file.saved)) void save(file);
  }, [save]);

  const track = useCallback(
    (file: OpenFile) => {
      file.model.onDidChangeContent(() => {
        // Its problems may have moved: no fixes for this file until the next build.
        if (diagnostics.current.some((d) => d.file === file.name)) setBuild((b) => (b.changed.has(file.name) ? b : { ...b, changed: new Set(b.changed).add(file.name) }));
        if (file.timer) clearTimeout(file.timer);
        file.timer = setTimeout(() => void save(file), SAVE_DELAY_MS);
        report(file.name, { state: "saving" });
      });
    },
    [save, report],
  );

  /** Load a file into the editor without showing it; null if it can't be read. */
  const ensureModel = useCallback(
    async (name: string): Promise<OpenFile | string> => {
      const loaded = files.current.get(name);
      if (loaded) return loaded;
      const read = await invoke("sketch:read", projectPath, name);
      if (!read.ok) return read.message;
      const again = files.current.get(name);
      if (again) return again;
      const file: OpenFile = { name, model: monaco.editor.createModel(read.content, languageFor(name), monaco.Uri.file(`/${name}`)), view: null, saved: read.content, writing: false };
      monaco.editor.setModelMarkers(file.model, MARKERS, markersFor(diagnostics.current, name, board));
      track(file);
      files.current.set(name, file);
      return file;
    },
    [projectPath, track, board],
  );

  const open = useCallback(
    async (name: string) => {
      setProblem(null);
      const file = await ensureModel(name);
      if (typeof file === "string") {
        setProblem(file);
        return;
      }
      setTabs((t) => (t.includes(name) ? t : [...t, name]));
      setActive(name);
    },
    [ensureModel],
  );

  /** Save every file now, and wait: a build compiles what's on disk. */
  const flushAll = useCallback(async () => {
    await Promise.all([...files.current.values()].map((file) => (file.timer || (!file.model.isDisposed() && file.model.getValue() !== file.saved) ? save(file) : undefined)));
  }, [save]);

  // ----- build (BLD-01, ERR-01) ---------------------------------------------------------
  /** Show a build's problems: in the panel and on their lines. A Run's build opens the panel only if it failed. */
  const showBuild = useCallback(
    async (result: BuildResult, fromBuildButton: boolean) => {
      diagnostics.current = result.diagnostics;
      // Problems in files that aren't open yet: load them, so fixes can be offered.
      for (const name of new Set(result.diagnostics.map((d) => d.file).filter((f): f is string => Boolean(f)))) await ensureModel(name);
      for (const file of files.current.values()) monaco.editor.setModelMarkers(file.model, MARKERS, markersFor(result.diagnostics, file.name, board));
      setBuild({ status: "done", slow: false, result, changed: new Set() });
      if (fromBuildButton || !result.ok) setPanel((p) => ({ open: true, tab: result.ok && p.open ? p.tab : "problems" }));
    },
    [ensureModel, board],
  );

  const runBuild = useCallback(async () => {
    if (build.status === "building") return;
    setBuild((b) => ({ ...b, status: "building", slow: false }));
    const slow = window.setTimeout(() => setBuild((b) => (b.status === "building" ? { ...b, slow: true } : b)), SLOW_BUILD_MS);
    await flushAll();
    const result = await invoke("build:compile", projectPath).catch(() => ({ ok: false, diagnostics: [], durationMs: 0, log: "", message: "The build didn't run. Try again." }));
    window.clearTimeout(slow);
    await showBuild(result, true);
  }, [build.status, flushAll, projectPath, showBuild]);
  useEffect(() => {
    buildRef.current = () => void runBuild();
  }, [runBuild]);

  // ----- upload (BLD-06) ----------------------------------------------------------------
  /** An upload's outcome, or a Hybrid run's: a failed build shows its problems like any build. */
  const showUpload = useCallback(
    async (result: UploadResult, chosen: UploadTarget) => {
      diagnostics.current = result.build.diagnostics;
      for (const name of new Set(result.build.diagnostics.map((d) => d.file).filter((f): f is string => Boolean(f)))) await ensureModel(name);
      for (const file of files.current.values()) monaco.editor.setModelMarkers(file.model, MARKERS, markersFor(result.build.diagnostics, file.name, board));
      setBuild({ status: "done", slow: false, result: result.build, changed: new Set() });
      setUpload({ status: "done", result, target: chosen });
      if (!result.ok) setPanel({ open: true, tab: "problems" });
    },
    [ensureModel, board],
  );
  const plugged = Boolean(target && boards?.boards.some((b) => b.port === target.port));
  const runUpload = useCallback(
    async (as?: HardwareBoardId) => {
      if (!target || upload.status === "building" || upload.status === "uploading") return;
      const chosen = { port: target.port, board: as ?? target.board };
      if (as) chooseTarget(chosen);
      if (!boards?.boards.some((b) => b.port === chosen.port)) {
        setHelpOpen(true);
        return;
      }
      setUpload({ status: "building", result: null, target: chosen });
      setPanel({ open: true, tab: "problems" });
      const stop = window.kiungo.on("upload:stage", ({ projectPath: p, stage }) => {
        if (p === projectPath && stage === "uploading") setUpload((u) => ({ ...u, status: "uploading" }));
      });
      await flushAll();
      const result: UploadResult = await invoke("upload:start", projectPath, chosen.port, chosen.board).catch(() => ({
        ok: false,
        stage: "upload" as const,
        build: { ok: false, diagnostics: [], durationMs: 0, log: "" },
        problem: { id: "unknown" as const, title: "The upload didn't run. Try again.", steps: [] },
        log: "",
        durationMs: 0,
      }));
      stop();
      await showUpload(result, chosen);
    },
    [target, upload.status, boards, chooseTarget, flushAll, projectPath, showUpload],
  );
  useEffect(() => {
    uploadRef.current = () => void runUpload();
  }, [runUpload]);
  // The lab's Run uses the board picked here for a run on a real board.
  const targetRef = useRef<UploadTarget | null>(null);
  useEffect(() => {
    targetRef.current = plugged ? target : null;
  }, [plugged, target]);
  useEffect(() => {
    if (!bridge) return;
    bridge.current = {
      flush: flushAll,
      showBuild: (result) => void showBuild(result, false),
      target: () => targetRef.current,
      showUpload: (result, chosen) => void showUpload(result, chosen),
    };
    return () => {
      bridge.current = null;
    };
  }, [bridge, flushAll, showBuild, showUpload]);

  const reveal = useCallback(
    async (d: Diagnostic) => {
      if (!d.file) return;
      await open(d.file);
      // After the model is shown.
      window.setTimeout(() => {
        const instance = editor.current;
        if (!instance) return;
        const position = { lineNumber: d.line, column: Math.max(1, d.column) };
        instance.setPosition(position);
        instance.revealPositionInCenter(position);
        instance.focus();
      }, 0);
    },
    [open],
  );

  /** Make a fix as one undo step (FIX-01). */
  const applyFix = useCallback(
    async (fix: QuickFix) => {
      const file = await ensureModel(fix.file);
      if (typeof file === "string") return setProblem(file);
      file.model.pushStackElement();
      file.model.pushEditOperations(
        [],
        fix.edits.map((e) => ({ range: new monaco.Range(e.line, e.column, e.line, e.column + e.length), text: e.text })),
        () => null,
      );
      file.model.pushStackElement();
      const first = fix.edits[0];
      await reveal({ file: fix.file, path: "", line: first.line, column: first.column + first.text.length, severity: "error", message: "", notes: [] });
    },
    [ensureModel, reveal],
  );

  // Ctrl+B builds from anywhere in the project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        buildRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        uploadRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reloadList = useCallback(async () => {
    const next = await invoke("sketch:list", projectPath);
    setList(next);
    return next;
  }, [projectPath]);

  // The editor itself, made once per project.
  useEffect(() => {
    if (!host.current) return;
    const dark = () => document.documentElement.dataset.theme === "dark";
    const instance = monaco.editor.create(host.current, {
      model: null,
      theme: dark() ? "kiungo-dark" : "kiungo-light",
      automaticLayout: true,
      fontFamily: '"JetBrains Mono Variable", Consolas, monospace',
      fontSize: 13.5,
      lineHeight: 21,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      padding: { top: 10 },
      smoothScrolling: true,
      fixedOverflowWidgets: true,
    });
    editor.current = instance;
    // The editor follows the app's light or dark mode.
    const observer = new MutationObserver(() => monaco.editor.setTheme(dark() ? "kiungo-dark" : "kiungo-light"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const blur = instance.onDidBlurEditorText(() => saveAll());
    // Ctrl+Enter (⌘↵) runs from the editor, as it does from the lab.
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => buildRef.current());
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => uploadRef.current());
    const opened = files.current;
    return () => {
      observer.disconnect();
      blur.dispose();
      for (const file of opened.values()) {
        if (file.timer) clearTimeout(file.timer);
        // Last words: send anything unsaved before the models go.
        if (file.model.getValue() !== file.saved) void invoke("sketch:write", projectPath, file.name, file.model.getValue());
        file.model.dispose();
      }
      opened.clear();
      instance.dispose();
      editor.current = null;
    };
  }, [projectPath, saveAll]);

  // Open the main sketch file first (on the next tick, so the first render isn't redone).
  useEffect(() => {
    const id = window.setTimeout(() => {
      void reloadList().then((names) => {
        const main = names.find((f) => f.main) ?? names[0];
        if (main) void open(main.name);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [reloadList, open]);

  // Show the active file, keeping each file's cursor and scroll.
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    const shown = instance.getModel();
    const leaving = shown ? [...files.current.values()].find((f) => f.model === shown) : undefined;
    if (leaving) {
      leaving.view = instance.saveViewState();
      void save(leaving);
    }
    const file = active ? files.current.get(active) : undefined;
    instance.setModel(file?.model ?? null);
    if (file?.view) instance.restoreViewState(file.view);
    if (file) instance.focus();
  }, [active, save]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveAll);
    return () => window.removeEventListener("beforeunload", saveAll);
  }, [saveAll]);

  // ----- tabs and files -----------------------------------------------------------------
  const closeTab = (name: string) => {
    const file = files.current.get(name);
    if (file) {
      files.current.delete(name);
      void save(file).finally(() => file.model.dispose());
    }
    const next = tabs.filter((x) => x !== name);
    setTabs(next);
    if (active === name) setActive(next[Math.max(0, tabs.indexOf(name) - 1)] ?? null);
  };

  const submitName = async (value: string) => {
    if (!naming) return;
    const name = value.trim();
    if (naming.mode === "new") {
      const result = await invoke("sketch:create", projectPath, name);
      if (!result.ok) return setProblem(result.message);
      setNaming(null);
      await reloadList();
      await open(name);
    } else {
      const from = naming.from;
      const file = files.current.get(from);
      if (file) await save(file);
      const result = await invoke("sketch:rename", projectPath, from, name);
      if (!result.ok) return setProblem(result.message);
      setNaming(null);
      if (file) {
        // Same text, same undo history; only the name (and how it's highlighted) changes.
        file.name = name;
        files.current.delete(from);
        files.current.set(name, file);
        monaco.editor.setModelLanguage(file.model, languageFor(name));
      }
      setStatus((all) => {
        const { [from]: moved, ...rest } = all;
        return moved ? { ...rest, [name]: moved } : rest;
      });
      setTabs((t) => t.map((x) => (x === from ? name : x)));
      if (active === from) setActive(name);
      await reloadList();
    }
    setProblem(null);
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Move ${name} to the trash? You can get it back from there.`)) return;
    const result = await invoke("sketch:delete", projectPath, name);
    if (!result.ok) return setProblem(result.message);
    const file = files.current.get(name);
    if (file) {
      if (file.timer) clearTimeout(file.timer);
      file.saved = file.model.getValue(); // nothing left to save
      files.current.delete(name);
      file.model.dispose();
    }
    setTabs((t) => t.filter((x) => x !== name));
    if (active === name) setActive(list.find((f) => f.main)?.name ?? null);
    await reloadList();
  };

  const find = () => {
    editor.current?.focus();
    void editor.current?.getAction("actions.find")?.run();
  };

  const shown = active ? (status[active] ?? { state: "saved" as const }) : { state: "saved" as const };
  const others = list.filter((f) => !tabs.includes(f.name));

  return (
    <section className="@container flex h-full min-h-0 min-w-0 flex-col border-l border-border bg-surface" aria-label="Code" data-testid="editor-pane" data-own-keys>
      {/* Run, upload, stop (EDT-06); find; files */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <button type="button" onClick={() => void runBuild()} disabled={build.status === "building"} title={`Build: check the code and see how much memory it uses (${shortcut("B")})`} aria-label="Build" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border px-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted-bg disabled:opacity-60" data-testid="editor-build">
          {build.status === "building" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Hammer className="size-3.5" aria-hidden />}
          <span className="hidden @[680px]:inline">Build</span>
        </button>
        <button type="button" onClick={onRun} disabled={running} title={`Run your code (${shortcut("↵")})`} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-primary px-2.5 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40" data-testid="editor-run">
          <Play className="size-3.5" aria-hidden />
          Run
        </button>
        <button
          type="button"
          onClick={() => (plugged ? void runUpload() : setHelpOpen(true))}
          disabled={upload.status === "building" || upload.status === "uploading"}
          title={plugged ? `Upload to the board on ${target?.port} (${shortcut("U")})` : "Plug in a board to upload"}
          aria-label="Upload"
          className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted-bg disabled:opacity-60"
          data-testid="editor-upload"
        >
          {upload.status === "building" || upload.status === "uploading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
          <span className="hidden @[680px]:inline">Upload</span>
        </button>
        <UploadPicker boards={boards} targets={targets} value={target} onChange={chooseTarget} onHelp={() => setHelpOpen(true)} />
        <button type="button" onClick={onStop} disabled={!running} aria-label="Stop" title="Stop" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted-bg disabled:opacity-40" data-testid="editor-stop">
          <Square className="size-3.5" aria-hidden />
          <span className="hidden @[680px]:inline">Stop</span>
        </button>
        <span className="flex-1" />
        {!panel.open && build.result ? (
          <button type="button" onClick={() => setPanel((p) => ({ ...p, open: true }))} className={cn("inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11.5px] font-medium hover:bg-muted-bg", build.result.diagnostics.length ? "text-danger" : "text-muted")} data-testid="editor-problems">
            {build.result.diagnostics.length ? <AlertCircle className="size-3.5" aria-hidden /> : <Check className="size-3.5 text-success" aria-hidden />}
            {build.result.diagnostics.length ? (
              <>
                {build.result.diagnostics.length}
                <span className="sr-only @[620px]:not-sr-only">{build.result.diagnostics.length === 1 ? " problem" : " problems"}</span>
              </>
            ) : (
              <span className="sr-only @[620px]:not-sr-only">Built</span>
            )}
          </button>
        ) : null}
        <span className={cn("inline-flex items-center gap-1 px-1.5 text-[11.5px]", shown.state === "error" ? "text-danger" : "text-muted")} title={shown.message} aria-live="polite" data-testid="editor-save">
          {shown.state === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : shown.state === "error" ? <AlertTriangle className="size-3.5" aria-hidden /> : <Check className="size-3.5 text-success" aria-hidden />}
          <span className={shown.state === "error" ? undefined : "sr-only @[620px]:not-sr-only"}>{shown.state === "saving" ? "Saving" : shown.state === "error" ? "Not saved" : "Saved"}</span>
        </span>
        <button type="button" onClick={find} title={`Find (${shortcut("F")})`} aria-label="Find" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground">
          <Search className="size-4" />
        </button>
        <button type="button" onClick={() => setNaming({ mode: "new" })} title="New file" aria-label="New file" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground" data-testid="editor-new-file">
          <FilePlus2 className="size-4" />
        </button>
        <button type="button" onClick={onClose} title={`Hide the code (${shortcut("E")})`} aria-label="Hide the code" className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-muted-bg hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Open files (EDT-01) */}
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-background" role="tablist" aria-label="Open files">
        {tabs.map((name) => {
          const meta = list.find((f) => f.name === name);
          const state = status[name]?.state ?? "saved";
          const selected = name === active;
          return (
            <div key={name} className={cn("group flex shrink-0 items-center border-r border-border", selected ? "bg-surface" : "hover:bg-muted-bg")}>
              <button type="button" role="tab" aria-selected={selected} onClick={() => setActive(name)} className={cn("h-full pl-3 pr-1 font-mono text-[12px]", selected ? "text-foreground" : "text-muted")} data-testid={`tab-${name}`}>
                {name}
                {state !== "saved" ? <span className={cn("ml-1.5 inline-block size-1.5 rounded-full align-middle", state === "error" ? "bg-danger" : "bg-muted")} aria-label={state === "error" ? "not saved" : "saving"} /> : null}
              </button>
              <Menu
                label={`More for ${name}`}
                items={[
                  ...(!meta?.main ? [{ id: "rename", label: "Rename", onSelect: () => setNaming({ mode: "rename", from: name }) }, { id: "delete", label: "Move to trash", danger: true, onSelect: () => void remove(name) }] : []),
                  ...(tabs.length > 1 ? [{ id: "close", label: "Close tab", onSelect: () => closeTab(name) }] : []),
                ]}
                buttonClassName="flex size-6 items-center justify-center rounded-[6px] text-muted opacity-0 hover:bg-muted-bg group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </Menu>
            </div>
          );
        })}
        {others.length ? (
          <Menu label="Other files" items={others.map((f) => ({ id: f.name, label: f.name, onSelect: () => void open(f.name) }))} buttonClassName="flex h-full items-center px-3 text-[12px] font-medium text-primary hover:bg-muted-bg">
            {others.length} more
          </Menu>
        ) : null}
      </div>

      {naming ? (
        <form
          className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitName(String(new FormData(e.currentTarget).get("name") ?? ""));
          }}
        >
          <label className="text-[12.5px] text-muted" htmlFor="sketch-file-name">
            {naming.mode === "new" ? "New file" : `Rename ${naming.from}`}
          </label>
          <input id="sketch-file-name" name="name" autoFocus defaultValue={naming.mode === "rename" ? naming.from : ""} placeholder="motor.h" className="h-8 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-2 font-mono text-[12.5px] outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent)]" onKeyDown={(e) => e.key === "Escape" && setNaming(null)} data-testid="file-name-input" />
          <button type="submit" className="h-8 rounded-[8px] bg-primary px-3 text-[12.5px] font-medium text-primary-foreground">
            {naming.mode === "new" ? "Create" : "Rename"}
          </button>
          <button type="button" onClick={() => setNaming(null)} className="h-8 rounded-[8px] px-2 text-[12.5px] text-muted hover:bg-muted-bg">
            Cancel
          </button>
        </form>
      ) : null}

      {problem ? (
        <p role="alert" className="flex shrink-0 items-start gap-2 border-b border-border bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-[12.5px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">{problem}</span>
          <button type="button" onClick={() => setProblem(null)} aria-label="Dismiss" className="text-muted">
            <X className="size-3.5" />
          </button>
        </p>
      ) : null}

      <div ref={host} className="min-h-0 flex-1" data-native-scrollbar data-testid="code-editor" />

      {panel.open ? (
        <div className="h-[clamp(160px,40%,340px)] shrink-0">
          <BuildPanel
            projectPath={projectPath}
            board={board}
            state={build}
            tab={panel.tab}
            onTab={(tab) => setPanel({ open: true, tab })}
            onClose={() => setPanel((p) => ({ ...p, open: false }))}
            onReveal={(d) => void reveal(d)}
            sourceOf={(name) => {
              const file = files.current.get(name);
              return file && !file.model.isDisposed() ? file.model.getValue() : null;
            }}
            onApplyFix={(fix) => void applyFix(fix)}
            onLibrariesChanged={() => void runBuild()}
            upload={upload}
            onRetryUpload={(as) => void runUpload(as)}
            serialPort={target && plugged ? target.port : null}
            boards={boards?.boards ?? []}
          />
        </div>
      ) : null}
      <BoardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
