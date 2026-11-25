import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CloudDownload, Code2, FilePlus2, FolderOpen, LogIn, LogOut, Maximize, PanelRight, Play, Redo2, RefreshCw, Search, Settings, Stethoscope, Undo2, UserRound, X, Box, Grid2x2, Zap } from "lucide-react";
import type { Appearance, AppInfo, OpenedProject, OpenResult, RecentProject, RemoteProject, Role } from "@kiungo/api";
import { useAuth } from "./account/useAuth";
import { SignInScreen } from "./account/SignInScreen";
import { Assistant } from "./assistant/Assistant";
import { Collaboration } from "./collaboration/Collaboration";
import { ComponentsLibrary } from "./components-library/ComponentsLibrary";
import { Dashboard } from "./dashboard/Dashboard";
import { Foundations } from "./foundations/Foundations";
import { ImportDialog } from "./home/ImportDialog";
import { NewProjectDialog } from "./home/NewProjectDialog";
import { invoke, shortcut } from "./ipc";
import { LearningCenter } from "./learning/LearningCenter";
import { Marketplace } from "./marketplace/Marketplace";
import { CommandPalette, type Command } from "./palette/CommandPalette";
import { ProjectScreen, type ProjectScreenHandle } from "./project/ProjectScreen";
import { ProjectsView } from "./projects/ProjectsView";
import { ResearchWorkspace } from "./research/ResearchWorkspace";
import { SettingsPage } from "./settings/SettingsPage";
import { AppShell } from "./shell/AppShell";
import { NoProjectOpen } from "./shell/NoProjectOpen";
import type { View } from "./shell/types";
import { useAppearance } from "./theme";
import { UpdateBanner } from "./update/UpdateBanner";
import { useUpdate } from "./update/useUpdate";

export function App() {
  const auth = useAuth();
  const update = useUpdate();
  const [view, setView] = useState<View>("dashboard");
  const [foundationsOpen, setFoundationsOpen] = useState(false);
  const [project, setProject] = useState<OpenedProject | null>(null);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState<{ starter: string | null } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The open lab's actions, kept in state (not a ref) so the palette's commands built during render may use them.
  const [lab, setLab] = useState<ProjectScreenHandle | null>(null);
  const openPath = project?.path ?? null;
  const [importOpen, setImportOpen] = useState(false);
  const [syncOn, setSyncOn] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [roles, setRoles] = useState<Role[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [remote, setRemote] = useState<{ projects: RemoteProject[] | null; message: string | null }>({ projects: null, message: null });
  const [downloading, setDownloading] = useState<string | null>(null);
  const signedIn = auth?.status === "signed-in";
  useAppearance(appearance);
  useEffect(() => {
    void invoke("projects:settings").then((s) => {
      setSyncOn(s.sync === true);
      setAppearance(s.appearance ?? "system");
      setRoles(s.roles ?? []);
    });
    void invoke("app:info").then(setAppInfo);
  }, []);
  const changeAppearance = useCallback((next: Appearance) => {
    setAppearance(next); // Right away: no wait on the round trip to main.
    void invoke("settings:set-appearance", next);
  }, []);
  const changeRoles = useCallback((next: Role[]) => {
    setRoles(next); // Right away: the sidebar and dashboard reflect it at once.
    void invoke("settings:set-roles", next);
  }, []);

  // Projects on the account but not here, each time Dashboard or Projects shows with sync on.
  const onProjectsNav = view === "dashboard" || view === "projects";
  useEffect(() => {
    if (!onProjectsNav || !signedIn || !syncOn) return;
    void invoke("sync:remote").then(
      (r) => setRemote(r.ok ? { projects: r.projects, message: null } : { projects: [], message: r.message }),
      () => setRemote({ projects: [], message: "Your account couldn't be read." }),
    );
  }, [onProjectsNav, signedIn, syncOn]);

  const refreshRecent = useCallback(() => {
    void invoke("projects:recent").then(setRecent, () => setRecent([]));
  }, []);
  useEffect(() => {
    if (onProjectsNav) refreshRecent();
  }, [onProjectsNav, refreshRecent]);

  /** Leave the open project: its last changes are saved before it's let go. */
  const closeOpen = useCallback(async () => {
    if (!openPath) return;
    // Unmount the project now: it sends its last change as it goes, before the close below.
    flushSync(() => setProject(null));
    await invoke("projects:close", openPath);
  }, [openPath]);

  const show = useCallback(
    async (result: OpenResult | null) => {
      if (!result) return;
      if (!result.ok) {
        await closeOpen();
        setError(result.message);
        refreshRecent();
        return;
      }
      if (result.project.path === openPath) {
        setView("simulation");
        return;
      }
      await closeOpen();
      setError(null);
      setProject(result.project);
      setView("simulation");
    },
    [closeOpen, openPath, refreshRecent],
  );

  const goDashboard = useCallback(() => {
    setError(null);
    setFoundationsOpen(false);
    setView("dashboard");
  }, []);
  const openFolder = useCallback(() => void invoke("projects:open-dialog").then(show), [show]);
  const openRecent = useCallback((p: RecentProject) => void invoke("projects:open-recent", p.path).then(show), [show]);
  const newProject = useCallback((starter: string | null = null) => setNewOpen({ starter }), []);

  // Shortcuts that work everywhere. The lab adds its own (⌘Z, ⌘↵, /, 1–3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        newProject();
      } else if (key === "o" && !e.shiftKey) {
        e.preventDefault();
        openFolder();
      } else if (key === "h" && e.shiftKey) {
        e.preventDefault();
        goDashboard();
      } else if (key === ",") {
        e.preventDefault();
        setFoundationsOpen(false);
        setView("settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newProject, openFolder, goDashboard]);

  // The palette lists recent projects too, so it needs the list on every screen.
  useEffect(() => {
    if (paletteOpen && recent === null) refreshRecent();
  }, [paletteOpen, recent, refreshRecent]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    if (project) {
      const g = "This project";
      const call = (fn: (l: ProjectScreenHandle) => void) => () => lab && fn(lab);
      list.push(
        { id: "code", title: "Show or hide the code", group: g, icon: <Code2 />, shortcut: shortcut("E"), keywords: "editor sketch ino", run: call((l) => l.toggleCode()) },
        { id: "run", title: "Run or stop", group: g, icon: <Play />, shortcut: shortcut("↵"), keywords: "start simulate", run: call((l) => l.toggleRun()) },
        { id: "parts", title: "Search parts", group: g, icon: <Search />, shortcut: "/", keywords: "add component sensor", run: call((l) => l.focusSearch()) },
        { id: "inspector", title: "Show or hide the Inspector", group: g, icon: <PanelRight />, keywords: "details pins", run: call((l) => l.toggleInspector()) },
        { id: "fit", title: "Fit the circuit to the screen", group: g, icon: <Maximize />, keywords: "zoom", run: call((l) => l.fit()) },
        { id: "view-3d", title: "View in 3D", group: g, icon: <Box />, shortcut: "1", run: call((l) => l.setView("reality")) },
        { id: "view-2d", title: "View in 2D", group: g, icon: <Grid2x2 />, shortcut: "2", run: call((l) => l.setView("top")) },
        { id: "view-trace", title: "View as Trace", group: g, icon: <Zap />, shortcut: "3", keywords: "current flow", run: call((l) => l.setView("flow")) },
        { id: "undo", title: "Undo", group: g, icon: <Undo2 />, shortcut: shortcut("Z"), run: call((l) => l.undo()) },
        { id: "redo", title: "Redo", group: g, icon: <Redo2 />, shortcut: shortcut("Z", { shift: true }), run: call((l) => l.redo()) },
        { id: "import", title: "Open a build file", group: g, icon: <FolderOpen />, keywords: "import json", run: call((l) => l.openFile()) },
        { id: "export", title: "Export the build", group: g, keywords: "save json download", run: call((l) => l.exportJson()) },
        { id: "reveal", title: "Show the project folder", group: g, icon: <FolderOpen />, keywords: "finder explorer files", run: () => void invoke("projects:reveal", project.path) },
        { id: "close", title: "Close project", group: g, icon: <X />, run: () => void closeOpen().then(goDashboard) },
      );
    }
    for (const item of [
      { view: "dashboard" as const, title: "Go to Dashboard" },
      { view: "projects" as const, title: "Go to Projects" },
      { view: "simulation" as const, title: "Go to Simulation" },
      { view: "components" as const, title: "Go to Components" },
      { view: "research" as const, title: "Go to Research" },
      { view: "learning" as const, title: "Go to Learning" },
      { view: "collaboration" as const, title: "Go to Collaboration" },
      { view: "marketplace" as const, title: "Go to Marketplace" },
      { view: "assistant" as const, title: "Go to AI Assistant" },
    ]) {
      if (item.view === view) continue;
      list.push({ id: `go-${item.view}`, title: item.title, group: "Navigate", run: () => setView(item.view) });
    }
    list.push(
      { id: "new", title: "New project", group: "Projects", icon: <FilePlus2 />, shortcut: shortcut("N"), keywords: "create starter", run: () => newProject() },
      { id: "open", title: "Open a project folder", group: "Projects", icon: <FolderOpen />, shortcut: shortcut("O"), run: openFolder },
    );
    for (const p of recent ?? []) {
      if (p.missing || p.path === openPath) continue;
      list.push({ id: `recent-${p.path}`, title: p.name ?? p.path, detail: p.boardName ?? undefined, group: "Recent projects", keywords: p.path, run: () => openRecent(p) });
    }
    if (auth?.status === "signed-in") {
      list.push(
        { id: "switch", title: "Switch account", detail: auth.user.email, group: "Account", icon: <UserRound />, run: () => void invoke("auth:sign-out").then(() => invoke("auth:sign-in")) },
        { id: "sign-out", title: "Sign out", detail: "Your projects stay on this computer", group: "Account", icon: <LogOut />, run: () => void invoke("auth:sign-out") },
      );
    } else list.push({ id: "sign-in", title: "Sign in", group: "Account", icon: <LogIn />, run: () => void invoke("auth:sign-in") });
    const u = update.info;
    if (u?.state.status === "ready") {
      const version = u.state.version;
      list.push({ id: "update-install", title: `Restart to update to Kiungo ${version}`, group: "Help", icon: <RefreshCw />, keywords: "update upgrade new version install", run: () => void update.install() });
    } else if (u) {
      const detail = u.state.status === "downloading" ? `Downloading ${u.state.version}, ${u.state.percent}%` : `You have ${u.currentVersion}${u.channel === "beta" ? " (beta)" : ""}`;
      list.push({ id: "update-check", title: "Check for updates", detail, group: "Help", icon: <CloudDownload />, keywords: "update upgrade new version", run: update.check });
    }
    list.push(
      { id: "settings", title: "Settings", group: "Help", icon: <Settings />, shortcut: shortcut(","), keywords: "appearance theme light dark version profile account roles", run: () => setView("settings") },
      { id: "foundations", title: "Check the toolchain and emulator", group: "Help", icon: <Stethoscope />, keywords: "diagnostics arduino cli compiler", run: () => void closeOpen().then(() => setFoundationsOpen(true)) },
    );
    return list;
  }, [project, lab, recent, openPath, view, goDashboard, newProject, openFolder, openRecent, closeOpen, auth, update]);

  // Nothing is wired up to an account backend yet, and everything is stored locally, so the app
  // opens straight to the Dashboard instead of forcing a sign-in on launch (sign-in is still
  // offered from the account menu). The one time we still show the full-screen sign-in state is
  // while the browser round-trip the person just started is in flight (DSK-01).
  const needsSignIn = auth !== null && auth.status === "waiting";
  useEffect(() => {
    if (needsSignIn && openPath) void closeOpen();
  }, [needsSignIn, openPath, closeOpen]);
  if (auth === null) return <div className="h-full bg-background" />;
  if (needsSignIn) return <SignInScreen state={auth as Extract<typeof auth, { status: "signed-out" | "waiting" }>} />;
  if (foundationsOpen) return <Foundations onHome={() => setFoundationsOpen(false)} />;

  return (
    <>
      <AppShell
        view={view}
        onView={setView}
        roles={roles}
        auth={auth}
        appearance={appearance}
        onAppearance={changeAppearance}
        onSettings={() => setView("settings")}
        onPalette={() => setPaletteOpen(true)}
      >
        {view === "dashboard" ? (
          <Dashboard auth={auth} roles={roles} recent={recent} onView={setView} onNewProject={() => newProject()} onOpenRecent={openRecent} />
        ) : view === "projects" ? (
          <ProjectsView
            recent={recent}
            error={error}
            onNew={newProject}
            onOpenFolder={openFolder}
            onOpen={openRecent}
            onReveal={(p) => void invoke("projects:reveal", p.path)}
            onForget={(p) => void invoke("projects:forget", p.path).then(setRecent)}
            onImportFile={() => void invoke("import:file").then(show)}
            onImportAccount={signedIn ? () => setImportOpen(true) : undefined}
            sync={
              signedIn
                ? {
                    enabled: syncOn,
                    onToggle: (enabled) => void invoke("sync:set-enabled", enabled).then((s) => setSyncOn(s.sync === true)),
                    remote: remote.projects,
                    message: remote.message,
                    downloading,
                    onDownload: (p) => {
                      setDownloading(p.id);
                      void invoke("sync:download", p.id)
                        .then(show)
                        .finally(() => setDownloading(null));
                    },
                  }
                : undefined
            }
          />
        ) : view === "simulation" || view === "firmware" ? (
          project ? (
            <ProjectScreen key={project.path} ref={setLab} project={project} onHome={goDashboard} />
          ) : (
            <NoProjectOpen what={view === "simulation" ? "simulate a circuit" : "build and upload firmware"} onNew={() => newProject()} onProjects={() => setView("projects")} />
          )
        ) : view === "components" ? (
          <ComponentsLibrary onAddToProject={() => (project ? setView("simulation") : newProject())} />
        ) : view === "research" ? (
          <ResearchWorkspace />
        ) : view === "learning" ? (
          <LearningCenter />
        ) : view === "collaboration" ? (
          <Collaboration />
        ) : view === "marketplace" ? (
          <Marketplace />
        ) : view === "assistant" ? (
          <Assistant onView={setView} />
        ) : (
          <SettingsPage auth={auth} appearance={appearance} onAppearance={changeAppearance} roles={roles} onRoles={changeRoles} update={update} info={appInfo} />
        )}
      </AppShell>
      <NewProjectDialog
        key={newOpen?.starter ?? "none"}
        open={newOpen !== null}
        initialStarter={newOpen?.starter ?? null}
        onClose={() => setNewOpen(null)}
        onCreated={(project) => {
          setNewOpen(null);
          void show({ ok: true, project });
        }}
      />
      {importOpen ? (
        <ImportDialog
          open
          onClose={() => setImportOpen(false)}
          onOpened={(result) => {
            setImportOpen(false);
            void show(result);
          }}
        />
      ) : null}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <UpdateBanner update={update} />
    </>
  );
}
