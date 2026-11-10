import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Code2, Download, FileUp, FolderOpen, House, Info, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@kiungo/ui/cn";
import type { OpenedProject } from "@kiungo/api";
import { SESSION_FILE_EXTENSION } from "@kiungo/core/lab/session-file";
import type { LabSession } from "@kiungo/core/lab/types";
import { boardName } from "@kiungo/core/project";
import type { MenuEntry } from "@kiungo/ui/menu";
import type { LabHost } from "@kiungo/lab/lab-context";
import { getPinout } from "@kiungo/core/lab/pinout";
import { LabWorkspace, type LabWorkspaceHandle, type TitleMenuApi } from "@kiungo/lab/LabWorkspace";
import { flushLab, setLabPersistence, useActiveSession, useLab } from "@kiungo/lab/store";
import { EditorPane } from "../editor/EditorPane";
import { programDriver, type EditorBridge } from "./program";
import { SyncChip } from "./SyncChip";
import { createWorldFeed, WorldPane } from "../world/WorldPane";
import type { WorldSpec } from "@kiungo/core/world/types";
import { invoke, shortcut } from "../ipc";
import { NO_PERSISTENCE, projectPersistence, type SaveState } from "./persistence";

/** The desktop app has no Component library page to link parts to. */
/** In the desktop app, Mode decides where Run runs the code (sprint 9). */
const HOST: LabHost = {
  modeNote: (node) =>
    getPinout(node.partId).controller
      ? node.mode === "virtual"
        ? "Run runs your code on an emulated board in the lab. Mark it Physical to run it on the board picked in Upload to."
        : "Run uploads your code, with Kiungo's Hybrid layer, to the board picked in Upload to. Parts marked Virtual are played by the lab; outputs are the real ones on your desk."
      : node.mode === "virtual"
        ? "Played by the lab. On a real board, the lab gives the sketch this part's readings."
        : "On your desk, wired to the real board: the board reads or drives it for real.",
};

interface ProjectScreenProps {
  project: OpenedProject;
  onHome: () => void;
}

/** The lab's actions, plus showing and hiding the code. */
export interface ProjectScreenHandle extends LabWorkspaceHandle {
  toggleCode: () => void;
}

const CODE_PREF = "kiungo.desktop.code";
/** Whether the code shows, and how wide: remembered on this computer. */
function readCodePref(): { open: boolean; width: number } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CODE_PREF) ?? "null") as { open?: unknown; width?: unknown } | null;
    return { open: raw?.open !== false, width: typeof raw?.width === "number" ? raw.width : 0.42 };
  } catch {
    return { open: true, width: 0.42 };
  }
}
function writeCodePref(pref: { open: boolean; width: number }) {
  try {
    window.localStorage.setItem(CODE_PREF, JSON.stringify(pref));
  } catch {
    /* only a convenience */
  }
}

/** An open project: the lab, saving into the project folder as you work. */
export const ProjectScreen = forwardRef<ProjectScreenHandle, ProjectScreenProps>(function ProjectScreen({ project, onHome }, ref) {
  const [save, setSave] = useState<SaveState>({ kind: "saved", at: null });
  const [lab, setLab] = useState<LabWorkspaceHandle | null>(null);
  const [running, setRunning] = useState(false);
  const [code, setCode] = useState(readCodePref);
  const row = useRef<HTMLDivElement>(null);
  // The lab's Run runs the project's own code on an emulated board; the editor saves first and shows the build's problems.
  const editorBridge = useRef<EditorBridge | null>(null);
  // The robot's world (sprint 8): world.json, the live feed from the running program, and which right-hand pane shows.
  const [world, setWorld] = useState<WorldSpec | null>(null);
  const worldRef = useRef<WorldSpec | null>(null);
  const feed = useMemo(() => createWorldFeed(), []);
  const [pane, setPane] = useState<"code" | "world">("code");
  useEffect(() => {
    let live = true;
    void invoke("world:read", project.path).then((w) => {
      if (!live) return;
      worldRef.current = w;
      setWorld(w);
      if (w) setPane("world");
    });
    return () => {
      live = false;
    };
  }, [project.path]);
  const program = useMemo(
    () => programDriver(project.path, project.meta.board, () => editorBridge.current, { world: () => worldRef.current, onState: (state, robot) => feed.push(state, robot) }),
    [project.path, project.meta.board, feed],
  );
  const saveWorldTimer = useRef<number | null>(null);
  const changeWorld = useCallback(
    (next: WorldSpec) => {
      worldRef.current = next;
      setWorld(next);
      // The running robot sees moved boxes at once; the file is saved once the dragging settles.
      program.setObstacles(next.obstacles);
      if (saveWorldTimer.current !== null) window.clearTimeout(saveWorldTimer.current);
      saveWorldTimer.current = window.setTimeout(() => void invoke("world:write", project.path, next), 400);
    },
    [program, project.path],
  );
  useEffect(() => () => program.stop(), [program]);
  const toggleCode = useCallback(() => setCode((c) => ({ ...c, open: !c.open })), []);
  useEffect(() => writeCodePref(code), [code]);

  useImperativeHandle(ref, () => (lab ? { ...lab, toggleCode } : (null as unknown as ProjectScreenHandle)), [lab, toggleCode]);

  // Ctrl+E (⌘E) shows or hides the code, from anywhere in the project, the editor included.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        e.stopPropagation();
        toggleCode();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleCode]);

  // Drag the divider to share the width between the circuit and the code.
  const startResize = (e: React.PointerEvent) => {
    const box = row.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const width = Math.min(0.7, Math.max(0.25, (box.right - ev.clientX) / box.width));
      setCode((c) => ({ ...c, width }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [warnings, setWarnings] = useState(project.warnings);
  const [notes, setNotes] = useState(project.notes ?? []);
  const session = useActiveSession();

  // The lab reads from and writes to this project while it's open.
  useEffect(() => {
    setLabPersistence(projectPersistence(project, setSave));
    useLab.getState().hydrate();
    const flush = () => flushLab();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flushLab();
      setLabPersistence(NO_PERSISTENCE);
    };
  }, [project]);

  const name = session?.name ?? project.meta.name;
  useEffect(() => {
    document.title = `${name} – Kiungo`;
    return () => {
      document.title = "Kiungo";
    };
  }, [name]);

  const titleMenu = ({ rename, openFile, exportJson }: TitleMenuApi): MenuEntry[] => [
    { id: "rename", label: "Rename", icon: <Pencil />, onSelect: rename },
    { id: "reveal", label: "Show in folder", icon: <FolderOpen />, onSelect: () => void invoke("projects:reveal", project.path) },
    { type: "separator", id: "s1" },
    { id: "import", label: "Open a build file…", icon: <FileUp />, hint: SESSION_FILE_EXTENSION, onSelect: openFile },
    { id: "export", label: "Export the build", icon: <Download />, hint: SESSION_FILE_EXTENSION, onSelect: exportJson },
    { type: "separator", id: "s2" },
    { id: "close", label: "Close project", icon: <House />, onSelect: onHome },
  ];

  const onOpenBuild = useMemo(
    () => (opened: LabSession, fileName: string) => {
      useLab.getState().replaceBuild(opened, fileName);
      return { name: opened.name, nodes: opened.nodes.length, wires: opened.wires.length };
    },
    [],
  );

  const saveState =
    save.kind === "error" ? (
      <button type="button" onClick={() => flushLab()} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium text-danger hover:bg-muted-bg" title={`${save.message} Click to try again.`} data-testid="save-status">
        <AlertTriangle className="size-3.5" aria-hidden />
        Not saved
      </button>
    ) : (
      <span className="hidden items-center gap-1 text-[11.5px] text-muted lg:inline-flex" title={`Saved in ${project.path}`} data-testid="save-status" aria-live="polite">
        {save.kind === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5 text-success" aria-hidden />}
        {save.kind === "saving" ? "Saving" : "Saved"}
      </span>
    );
  const saveStatus = (
    <>
      {saveState}
      <SyncChip projectPath={project.path} initial={project.sync} />
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {warnings.length ? (
        <div role="status" className="flex shrink-0 items-start gap-2 border-b border-border bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] px-4 py-2 text-[12.5px]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1">
            Some of this circuit couldn&apos;t be opened, so it was left out: {warnings.slice(0, 3).join(" ")}
            {warnings.length > 3 ? ` And ${warnings.length - 3} more.` : ""}
          </p>
          <button type="button" onClick={() => setWarnings([])} aria-label="Dismiss" className="flex size-6 items-center justify-center rounded-[6px] text-muted hover:bg-muted-bg">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {notes.length ? (
        <div role="status" className="flex shrink-0 items-start gap-2 border-b border-border bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))] px-4 py-2 text-[12.5px]" data-testid="project-notes">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1">{notes.join(" ")}</p>
          <button type="button" onClick={() => setNotes([])} aria-label="Dismiss" className="flex size-6 items-center justify-center rounded-[6px] text-muted hover:bg-muted-bg">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <div ref={row} className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
        <LabWorkspace
          ref={setLab}
          onRunningChange={setRunning}
          program={program}
          trailing={
            <button type="button" onClick={toggleCode} aria-pressed={code.open} aria-label={code.open ? "Hide the code" : "Show the code"} title={`Code (${shortcut("E")})`} className={cn("flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-medium transition-colors", code.open ? "bg-muted-bg text-foreground" : "text-muted hover:bg-muted-bg")} data-testid="toggle-code">
              <Code2 className="size-4" aria-hidden />
              <span className="hidden xl:inline">Code</span>
            </button>
          }
          host={HOST}
          titleMenu={titleMenu}
          titleMenuLabel="Project menu"
          saveStatus={saveStatus}
          generator="Kiungo desktop"
          onOpenBuild={onOpenBuild}
          projectChip={<span className="hidden text-[11.5px] text-muted xl:inline">{boardName(project.meta.board)}</span>}
          leading={
            <button type="button" onClick={onHome} title={`Home (${shortcut("H", { shift: true })})`} aria-label="Home" className="flex size-9 items-center justify-center rounded-[10px] text-muted hover:bg-muted-bg hover:text-foreground" data-testid="go-home">
              <House className="size-4" />
            </button>
          }
        />
        </div>
        {code.open ? (
          <>
            <div role="separator" aria-orientation="vertical" aria-label="Resize the code" tabIndex={0} onPointerDown={startResize} onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setCode((c) => ({ ...c, width: Math.min(0.7, c.width + 0.03) }));
              if (e.key === "ArrowRight") setCode((c) => ({ ...c, width: Math.max(0.25, c.width - 0.03) }));
            }} className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40 focus-visible:bg-primary" />
            <div className="flex min-h-0 shrink-0 flex-col" style={{ width: `${code.width * 100}%` }}>
              <div className="flex h-9 shrink-0 items-stretch gap-1 border-b border-l border-border bg-background px-2" role="tablist" aria-label="Beside the circuit">
                {(["code", "world"] as const).map((id) => (
                  <button key={id} type="button" role="tab" aria-selected={pane === id} onClick={() => setPane(id)} className={cn("border-b-2 px-2.5 text-[12.5px] font-medium", pane === id ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground")} data-testid={`pane-${id}`}>
                    {id === "code" ? "Code" : "World"}
                  </button>
                ))}
              </div>
              {/* The editor stays mounted behind the World, so its files and undo history stay. */}
              <div className={cn("min-h-0 flex-1", pane === "code" ? "block" : "hidden")}>
                <EditorPane projectPath={project.path} board={`the ${boardName(project.meta.board)}`} boardPart={project.meta.board} bridge={editorBridge} running={running} onRun={() => lab?.run()} onStop={() => lab?.stop()} onClose={toggleCode} />
              </div>
              {pane === "world" ? (
                <div className="min-h-0 flex-1 border-l border-border bg-surface">
                  <WorldPane world={world} feed={feed} running={running} onChange={changeWorld} />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
});
