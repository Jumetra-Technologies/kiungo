/**
 * Kiungo 2 main process: the window, the app's own protocol, and the IPC
 * handlers the interface may call. The interface gets no Node access; it
 * talks to this process only through the channels in @kiungo/api.
 */
import { spawn } from "node:child_process";
import { app, BrowserWindow, dialog, ipcMain, net, powerMonitor, protocol, session, shell } from "electron";
import { hostname } from "node:os";
import { readFileSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
// The app icon, for the window on Linux and for a development copy (installed copies on Windows
// and macOS get it from the installer: electron-builder.yml). electron-vite copies the file into out/main.
import appIcon from "../../build/icon.png?asset";
import { APPEARANCES, EMULATED_BOARDS, EXAMPLE_SKETCHES, INSTALLABLE_CORES, isInvokeChannel, ROLES, type AuthState, type Handlers, type Platform } from "@kiungo/api";
import { PROJECT_FILE } from "@kiungo/core/project";
import { hardwareBoard, uploadTargetsFor } from "@kiungo/core/hardware/boards";
import { VENDOR_HOSTS } from "@kiungo/core/parts/vendor-links";
import { keychainStore } from "./auth/secret-store";
import { AuthService } from "./auth/service";
import { ProjectService } from "./projects/service";
import { SketchFiles } from "./projects/sketch";
import { BuildService } from "./build/service";
import { LibraryTrust } from "./build/library-trust";
import { DEBUG_SWITCHES, isSafeWebUrl, overridable as overridableUrl } from "./security";
import { BoardWatcher } from "./hardware/boards";
import { defaultDoctorEnv, diagnosePorts, DRIVER_LINKS } from "./hardware/doctor";
import { BAUD_RATES, SerialMonitor } from "./hardware/serial";
import { HybridService } from "./hybrid/service";
import { HybridLink } from "./hybrid/link";
import { HYBRID_BOARDS, parsePlan } from "@kiungo/core/hybrid/plan";
import { AccountClient } from "./account/client";
import { ActivityReporter } from "./activity/reporter";
import { importFromAccount, importSessionText, listAccount } from "./account/import";
import { SyncService } from "./sync/service";
import { parseProjectMeta } from "@kiungo/core/project";
import type { SyncStatus } from "@kiungo/api";
import { createHash } from "node:crypto";
import { compileSketch, installCore, locateCli, runCli, toolchainStatus, type CliLocation } from "./toolchain/arduino-cli";
import { UpdateService, updateSupport, type Updater } from "./updater/service";

const APP_SCHEME = "kiungo-app";
/** The website sends the app back to kiungo://signin after signing in. */
const LINK_SCHEME = "kiungo";

/** An address from a KIUNGO_* variable; an installed copy takes https only (main/security.ts). */
const overridable = (name: string, fallback: string) => overridableUrl(process.env[name], fallback, app.isPackaged, (m) => console.warn(`${name} ${m}`));

/** The dev server's address, honoured only by a development copy: an installed one trusts its own pages alone. */
const DEV_RENDERER_URL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL || null : null;

// An installed copy never runs with a debugger attached from the command line (a shortcut, a crafted link):
// it would give whoever started it the interface, and with it the signed-in session. The build's fuses
// (electron-builder.yml) turn off --inspect and ELECTRON_RUN_AS_NODE; Chromium's own switches are refused here.
if (app.isPackaged && DEBUG_SWITCHES.some((s) => app.commandLine.hasSwitch(s))) {
  console.error("Kiungo doesn't start with debugging switches.");
  app.exit(1);
}

/** The backend the app signs in with. KIUNGO_API_URL points it at another one (staging, a local backend). */
const API_BASE = overridable("KIUNGO_API_URL", "https://kiungo-api.onrender.com");
/**
 * Where the app looks for new versions: <channel>.yml files (beta.yml, latest.yml, and -linux for the
 * AppImage) that the release workflow keeps on this repository's desktop-feed release. Copies up to
 * 0.13 read jumetra-frontend's instead (the app's home until Nov 2026); the release workflow keeps
 * that one in step too, so they update onto this feed. KIUNGO_UPDATE_URL points it at another feed,
 * e.g. the backend's once the release pipeline serves one.
 */
const UPDATE_FEED = overridable("KIUNGO_UPDATE_URL", "https://github.com/Jumetra-Technologies/kiungo/releases/download/desktop-feed");
/** Where a copy that can't update itself gets a new version. */
const DOWNLOAD_PAGE = "https://jumetra-frontendv0.vercel.app/#desktop";
const FQBN = { uno: "arduino:avr:uno", nano: "arduino:avr:nano:cpu=atmega328" } as const;

/**
 * Shared memory (SharedArrayBuffer) between the interface and the emulator
 * workers needs the page to be cross-origin isolated.
 */
const ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};
const CSP = [
  "default-src 'self'",
  // WebAssembly only (the robot world's physics, Rapier): no JavaScript eval.
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  // The account picture comes from Google or GitHub.
  "img-src 'self' data: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

let windowShownAt: number | null = null;
let mainWindow: BrowserWindow | null = null;
let projects: ProjectService | null = null;

/** Made once the app is ready: the folders it uses come from Electron. */
function projectService(): ProjectService {
  projects ??= new ProjectService({
    appDataDir: app.getPath("userData"),
    defaultProjectsFolder: join(app.getPath("documents"), "Kiungo"),
    generator: `Kiungo ${app.getVersion()}`,
  });
  return projects;
}

/** A folder picker attached to the window, so it opens in front of it. */
async function chooseFolder(options: Electron.OpenDialogOptions): Promise<string | null> {
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 4096;

let auth: AuthService | null = null;
function authService(): AuthService {
  auth ??= new AuthService({
    apiBase: API_BASE,
    device: {
      // The computer's name as the person knows it, shown on the website's approval page and their device list.
      name: (hostname() || "This computer").slice(0, 120),
      platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
      appVersion: app.getVersion(),
    },
    store: keychainStore(join(app.getPath("userData"), "session.bin")),
    // The sign-in page the backend names: https, or this computer for a local backend (never "http://localhost.example.com").
    openBrowser: (url) => (isSafeWebUrl(url) ? shell.openExternal(url) : Promise.resolve()),
    onChange: (state: AuthState) => mainWindow?.webContents.send("auth:changed", state),
  });
  return auth;
}

const sketchFiles = new SketchFiles((path) => shell.trashItem(path));
/** Sketch files belong to the project open in this window, and only that one. */
const openProject = (path: unknown): path is string => isText(path) && projectService().isOpen(path);
const notOpen = { ok: false as const, message: "This project isn't open." };

/** Links (kiungo://signin?…) arrive before the window exists on a cold start; hold them until then. */
const pendingLinks: string[] = [];
function handleLink(link: string) {
  if (!link.startsWith(`${LINK_SCHEME}://`)) return;
  if (!app.isReady()) {
    pendingLinks.push(link);
    return;
  }
  void authService().handleLink(link);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const rendererDir = () => join(__dirname, "../renderer");
const devResourcesDir = () => join(__dirname, "../../resources");
const resourcesDir = () => (app.isPackaged ? process.resourcesPath : devResourcesDir());

/** Serves the built interface with the isolation headers and a strict content policy. */
function serveRenderer() {
  protocol.handle(APP_SCHEME, async (request) => {
    const root = normalize(rendererDir());
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = normalize(join(root, pathname === "/" ? "index.html" : pathname));
    if (file !== root && !file.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(ISOLATION_HEADERS)) headers.set(k, v);
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set("Content-Security-Policy", CSP);
    return new Response(response.body, { status: response.status, headers });
  });
}

function cli() {
  return locateCli({
    platform: process.platform,
    arch: process.arch,
    resourcesDir: resourcesDir(),
    devResourcesDir: devResourcesDir(),
    userDataDir: app.getPath("userData"),
    env: process.env,
  });
}

let trust: LibraryTrust | null = null;
const libraryTrust = () => (trust ??= new LibraryTrust(join(app.getPath("userData"), "trusted-libraries.json")));

/** Before a project builds with libraries this computer hasn't used: the person decides, in a dialog the interface can't answer for them. */
async function approveLibraries(projectPath: string, libraries: Array<{ name: string; version: string }>): Promise<boolean> {
  const unknown = await libraryTrust().unknown(libraries.map((l) => ({ ...l, dependency: false })));
  if (!unknown.length) return true;
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    title: "Build with these libraries?",
    message: `This project builds with ${unknown.length === 1 ? "a library" : "libraries"} you haven't used in Kiungo before`,
    detail: `${unknown.map((l) => `• ${l.name} ${l.version}`).join("\n")}\n\nA library's build settings can run programs on this computer. Build only if you trust whoever made this project (${projectPath}).`,
    buttons: ["Build", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  if (response !== 0) return false;
  await libraryTrust().trust(unknown.map((l) => l.name));
  return true;
}

let builds: BuildService | null = null;
const buildService = () =>
  (builds ??= new BuildService({
    cli,
    buildsDir: join(app.getPath("userData"), "builds"),
    run: runCli,
    approveLibraries,
    trustLibraries: (names) => libraryTrust().trust(names),
  }));
/** Arduino CLI as a long-running child (port discovery, the serial monitor). */
const spawnCli = (location: CliLocation, args: string[]) =>
  spawn(location.binary, ["--config-file", location.configFile, "--no-color", ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

let watcher: BoardWatcher | null = null;
const boardWatcher = () =>
  (watcher ??= new BoardWatcher({ cli, run: runCli, spawn: spawnCli, onChange: (boards) => mainWindow?.webContents.send("boards:changed", boards) }));

let monitor: SerialMonitor | null = null;
const serialMonitor = () =>
  (monitor ??= new SerialMonitor({
    cli,
    spawn: spawnCli,
    onData: (port, text) => mainWindow?.webContents.send("serial:data", { port, text }),
    onClosed: (port, message) => mainWindow?.webContents.send("serial:closed", { port, message }),
  }));
// Usage for the admin portal: which screen is open and that someone is using the app (main/activity/reporter.ts).
let activity: ActivityReporter | null = null;
const activityReporter = () =>
  (activity ??= new ActivityReporter({
    apiBase: API_BASE,
    token: () => authService().token(),
    window: () => mainWindow,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    page: () => (projects && projects.openCount() > 0 ? "/desktop/project" : "/desktop/home"),
    appVersion: app.getVersion(),
  }));

let account: AccountClient | null = null;
const accountClient = () => (account ??= new AccountClient({ apiBase: API_BASE, token: () => authService().token(), timeoutMs: 15_000 }));

// ----- project sync (DSK-14) -----
let syncer: SyncService | null = null;
const syncService = () =>
  (syncer ??= new SyncService({
    account: accountClient(),
    device: () => {
      const auth = authService().current();
      return auth.status === "signed-in" ? auth.deviceName : hostname();
    },
  }));
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** How long after a save settles before it's sent: at most one sync every 30 s while editing. */
const SYNC_AFTER_MS = 30_000;
const sendSync = (projectPath: string, status: SyncStatus) => mainWindow?.webContents.send("sync:status", { projectPath, status });

async function syncProject(path: string, mode: "open" | "push"): Promise<SyncStatus> {
  const at = new Date().toISOString();
  if (!(await projectService().settings()).sync) return { state: "off", at };
  if (authService().current().status !== "signed-in") {
    const status: SyncStatus = { state: "signed-out", at, message: "Sign in to sync projects with your account." };
    sendSync(path, status);
    return status;
  }
  const meta = mode === "open" ? await readFile(join(path, PROJECT_FILE), "utf8").then(parseProjectMeta).catch(() => null) : projectService().metaOf(path);
  if (!meta) return { state: "error", at, message: "This project couldn't be read." };
  sendSync(path, { state: "syncing", at });
  const status = await syncService().sync(path, { id: meta.id, name: meta.name, board: meta.board }, mode);
  sendSync(path, status);
  return status;
}

function scheduleSync(path: string, delay = SYNC_AFTER_MS): void {
  const pending = syncTimers.get(path);
  if (pending) clearTimeout(pending);
  syncTimers.set(
    path,
    setTimeout(() => {
      syncTimers.delete(path);
      if (projectService().isOpen(path)) void syncProject(path, "push");
    }, delay),
  );
}

/** Open a project folder, taking the account's newer changes first when sync is on. */
async function openWithSync(path: string) {
  const sync = await syncProject(path, "open").catch(() => null);
  const result = await projectService().openFolder(path);
  if (!result.ok) return result;
  scheduleSync(result.project.path, 2_000);
  return sync && sync.state !== "off" ? { ...result, project: { ...result.project, sync } } : result;
}

let hybrid: HybridService | null = null;
const hybridService = (projectPath: string) => {
  // One work folder per project, so its build cache survives between runs.
  const workDir = join(app.getPath("userData"), "builds", `${createHash("sha256").update(projectPath).digest("hex").slice(0, 16)}-hybrid`);
  if (!hybrid || hybrid.workDir !== workDir) hybrid = new HybridService(buildService(), { resources: join(resourcesDir(), "hybrid"), workDir });
  return hybrid;
};
let link: HybridLink | null = null;
const hybridLink = () => (link ??= new HybridLink({ cli, spawn: spawnCli, onEvent: (port, event) => mainWindow?.webContents.send("hybrid:link", { port, ...event }) }));
/** Uploads in flight (plain and Hybrid): the app mustn't restart to update in the middle of one. */
let uploading = 0;
async function whileUploading<T>(work: () => Promise<T>): Promise<T> {
  uploading++;
  try {
    return await work();
  } finally {
    uploading--;
  }
}
const hostPlatform = process.platform === "win32" || process.platform === "darwin" ? process.platform : "linux";
// ----- Kiungo's own updates -----
/** beta or stable: the release workflow writes it into the packaged package.json (kiungo.updateChannel). */
function updateChannel(): "beta" | "stable" {
  try {
    const pkg = JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8")) as { kiungo?: { updateChannel?: string } };
    return pkg.kiungo?.updateChannel === "stable" ? "stable" : "beta";
  } catch {
    return "beta";
  }
}
let updates: UpdateService | null = null;
const updateService = () => {
  if (updates) return updates;
  const channel = updateChannel();
  updates = new UpdateService({
    currentVersion: app.getVersion(),
    channel,
    support: updateSupport({ platform: process.platform, packaged: app.isPackaged, env: process.env }),
    downloadUrl: DOWNLOAD_PAGE,
    updater: () => {
      // Loaded only when this copy can update itself.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
      // Stable copies read latest.yml; beta copies read beta.yml, which the workflow also points at each stable release.
      autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED, channel: channel === "stable" ? "latest" : "beta", useMultipleRangeRequest: false });
      // A development copy only gets here with KIUNGO_UPDATE_URL set (updateSupport): let it check its feed.
      autoUpdater.forceDevUpdateConfig = !app.isPackaged;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowDowngrade = false;
      autoUpdater.logger = { info: () => undefined, warn: (m: unknown) => console.warn("updater:", m), error: (m: unknown) => console.error("updater:", m), debug: () => undefined };
      return autoUpdater as unknown as Updater;
    },
    busy: () => {
      if (link?.open) return "Stop the run on your board first, then restart to update.";
      if (uploading > 0) return "Wait for the upload to finish, then restart to update.";
      return null;
    },
    prepareToQuit,
    onChange: (info) => mainWindow?.webContents.send("update:changed", info),
    log: (m) => console.warn(m),
  });
  return updates;
};

const DRIVER_URLS = new Set<string>(Object.values(DRIVER_LINKS).map((l) => l.url));

/** A library name as the Arduino index writes it, and a version number. */
const isLibraryName = (v: unknown): v is string => typeof v === "string" && /^[\w][\w .+\-()]{0,99}$/.test(v) && !v.includes("..");
const isVersion = (v: unknown): v is string => typeof v === "string" && /^\d+(\.\d+){0,2}([-+][\w.]+)?$/.test(v);
const notAdded = { ok: false as const, message: "Refused: that isn't a library name." };

const handlers: Handlers = {
  "app:info": () => ({
    appVersion: app.getVersion(),
    platform: process.platform as Platform,
    arch: process.arch,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  }),
  "app:metrics": () => ({
    toWindowShownMs: windowShownAt === null ? null : Math.round(windowShownAt),
    mainRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    totalMb: Math.round(app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024),
  }),
  "toolchain:status": () => toolchainStatus(cli()),
  "toolchain:compile-example": async (sketch, board) => {
    if (!EXAMPLE_SKETCHES.includes(sketch) || !EMULATED_BOARDS.includes(board)) throw new Error("Unknown example or board.");
    const location = cli();
    if (!location) return { ok: false, durationMs: 0, log: "Arduino CLI wasn't found." };
    const sketchDir = join(resourcesDir(), "sketches", sketch);
    const buildPath = join(app.getPath("userData"), "builds", `${sketch}-${board}`);
    return compileSketch(location, sketchDir, FQBN[board], buildPath);
  },
  "toolchain:install-core": async (core) => {
    if (!INSTALLABLE_CORES.includes(core)) throw new Error("Unknown board core.");
    const location = cli();
    if (!location) return { ok: false, durationMs: 0, log: "Arduino CLI wasn't found." };
    return installCore(location, core);
  },
  "projects:recent": () => projectService().recent(),
  "projects:create": (input) => {
    if (!input || typeof input !== "object") throw new Error("Refused: no project details.");
    return projectService().create({ name: String(input.name ?? ""), board: String(input.board ?? ""), starter: typeof input.starter === "string" ? input.starter : null });
  },
  "projects:open-recent": async (path) => {
    if (!isText(path) || !(await projectService().isRecent(path))) return { ok: false, message: "That project isn't in the recent list." };
    return openWithSync(path);
  },
  "projects:open-dialog": async () => {
    const folder = await chooseFolder({ title: "Open a Kiungo project", buttonLabel: "Open project", properties: ["openDirectory"] });
    return folder ? openWithSync(folder) : null;
  },
  "projects:save": (path, payload) => {
    if (!isText(path) || !payload || typeof payload !== "object") return { ok: false, message: "Refused: nothing to save." };
    return projectService()
      .save(path, payload)
      .then((result) => {
        if (result.ok) scheduleSync(path);
        return result;
      });
  },
  "projects:close": async (path) => {
    if (!isText(path)) return;
    const pending = syncTimers.get(path);
    await projectService().close(path);
    // What changed since the last sync goes now, without holding up the close.
    if (pending) {
      clearTimeout(pending);
      syncTimers.delete(path);
      void syncProject(path, "open").catch(() => undefined);
    }
  },
  "projects:forget": (path) => (isText(path) ? projectService().forget(path) : projectService().recent()),
  "projects:reveal": async (path) => {
    if (!isText(path)) return;
    if (projectService().isOpen(path) || (await projectService().isRecent(path))) shell.showItemInFolder(join(path, PROJECT_FILE));
  },
  "projects:settings": () => projectService().settings(),
  "auth:state": () => authService().current(),
  "auth:sign-in": () => authService().signIn(),
  "auth:cancel": () => authService().cancel(),
  "auth:sign-out": () => authService().signOut(),
  "auth:skip": () => authService().skip(),
  "sketch:list": (path) => (openProject(path) ? sketchFiles.list(path) : []),
  "sketch:read": (path, name) => (openProject(path) ? sketchFiles.read(path, name) : notOpen),
  "sketch:write": (path, name, content) => (openProject(path) ? sketchFiles.write(path, name, content) : notOpen),
  "sketch:create": (path, name) => (openProject(path) ? sketchFiles.create(path, name) : notOpen),
  "sketch:rename": (path, from, to) => (openProject(path) ? sketchFiles.rename(path, from, to) : notOpen),
  "sketch:delete": (path, name) => (openProject(path) ? sketchFiles.remove(path, name) : notOpen),
  "build:compile": (path) => (openProject(path) ? buildService().compile(path) : { ok: false, diagnostics: [], durationMs: 0, message: notOpen.message, log: "" }),
  "libraries:list": (path) => (openProject(path) ? buildService().libraries(path) : []),
  "libraries:search": (query) => (typeof query === "string" ? buildService().search(query) : { ok: true, libraries: [] }),
  "libraries:add": (path, name, version) => {
    if (!openProject(path)) return notOpen;
    if (!isLibraryName(name) || (version !== undefined && !isVersion(version))) return notAdded;
    return buildService().add(path, name, version);
  },
  "libraries:remove": (path, name) => {
    if (!openProject(path)) return notOpen;
    return isLibraryName(name) ? buildService().remove(path, name) : notAdded;
  },
  "boards:list": async () => {
    await boardWatcher().start();
    return { boards: boardWatcher().list(), message: boardWatcher().message };
  },
  "boards:doctor": async () => {
    await boardWatcher().start();
    return diagnosePorts(await boardWatcher().refresh(), defaultDoctorEnv(process.platform));
  },
  "boards:open-link": async (url) => {
    if (typeof url === "string" && DRIVER_URLS.has(url)) await shell.openExternal(url);
  },
  "marketplace:open-vendor-link": async (url) => {
    if (typeof url !== "string") return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol === "https:" && VENDOR_HOSTS.includes(parsed.hostname)) await shell.openExternal(url);
  },
  "upload:start": async (path, port, boardId) => {
    const refused = (message: string) => ({ ok: false, stage: "upload" as const, build: { ok: false, diagnostics: [], durationMs: 0, log: "", message }, log: "", durationMs: 0, problem: { id: "unknown" as const, title: message, steps: [] } });
    if (!openProject(path)) return refused(notOpen.message);
    const board = typeof boardId === "string" ? hardwareBoard(boardId) : undefined;
    const projectBoard = projectService().boardOf(path);
    if (!board || !projectBoard || !uploadTargetsFor(projectBoard).some((b) => b.id === board.id)) return refused("This project's code isn't written for that board.");
    if (!isText(port) || !boardWatcher().has(port)) return refused("That board isn't plugged in any more. Pick it again in Upload to.");
    // The upload needs the port: close the monitor, and reopen it after.
    const reopen = serialMonitor().open?.port === port ? serialMonitor().open : null;
    if (reopen) serialMonitor().stop();
    const result = await whileUploading(() => buildService().upload(path, port, board, hostPlatform, (stage) => mainWindow?.webContents.send("upload:stage", { projectPath: path, stage })));
    // Boards reset after an upload; give the port a moment to come back.
    if (reopen) setTimeout(() => serialMonitor().start(reopen.port, reopen.baud), 1200);
    return { ...result, ...(reopen ? { monitorReopened: true } : {}) };
  },
  "serial:open": (port, baud) => {
    if (!isText(port) || !boardWatcher().has(port)) return { ok: false, message: "That board isn't plugged in." };
    if (!(BAUD_RATES as readonly number[]).includes(baud)) return { ok: false, message: "Pick one of the listed speeds." };
    return serialMonitor().start(port, baud);
  },
  "serial:write": (text) => (typeof text === "string" && text.length <= 4096 ? serialMonitor().write(text) : false),
  "serial:close": () => serialMonitor().stop(),
  "hybrid:start": async (path, port, boardId, rawPlan) => {
    const refused = (message: string) => ({ ok: false, stage: "upload" as const, build: { ok: false, diagnostics: [], durationMs: 0, log: "", message }, log: "", durationMs: 0, problem: { id: "unknown" as const, title: message, steps: [] } });
    if (!openProject(path)) return refused(notOpen.message);
    const board = typeof boardId === "string" ? hardwareBoard(boardId) : undefined;
    const projectBoard = projectService().boardOf(path);
    if (!board || !projectBoard || !uploadTargetsFor(projectBoard).some((b) => b.id === board.id)) return refused("This project's code isn't written for that board.");
    if (!HYBRID_BOARDS.has(board.id)) return refused(`Hybrid runs work on the Uno and the Nano for now. Run it all in the lab, or upload it to the ${board.name} without Kiungo.`);
    if (!isText(port) || !boardWatcher().has(port)) return refused("That board isn't plugged in any more. Pick it again in Upload to.");
    const parsed = parsePlan(rawPlan, board.fqbn);
    if (!parsed.ok) return refused(parsed.message);
    // The upload and the link both need the port.
    hybridLink().stop();
    if (serialMonitor().open?.port === port) serialMonitor().stop();
    const result = await whileUploading(() => hybridService(path).upload(path, port, board, parsed.plan, hostPlatform, (stage) => mainWindow?.webContents.send("upload:stage", { projectPath: path, stage })));
    if (!result.ok) return result;
    const started = hybridLink().start(port);
    return started.ok ? result : { ...result, ok: false, problem: { id: "unknown" as const, title: started.message, steps: [] } };
  },
  "hybrid:set": (pairs) => {
    if (!Array.isArray(pairs) || pairs.length > 64) return;
    const ok = pairs.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && p[0] >= 0 && p[0] < 8 && Number.isInteger(p[1]) && p[1] >= -2147483648 && p[1] <= 2147483647);
    hybridLink().set(ok);
  },
  "hybrid:serial-in": (text) => {
    if (typeof text !== "string" || text.length > 4096 || !hybridLink().open) return false;
    hybridLink().sendText(text);
    return true;
  },
  "hybrid:stop": () => link?.stop(),
  "hybrid:emergency-stop": () => link?.emergencyStop(),
  "sync:set-enabled": async (enabled) => {
    const settings = await projectService().setSync(enabled === true);
    return settings;
  },
  "sync:now": (path) => (openProject(path) ? syncProject(path, "push") : { state: "error", at: new Date().toISOString(), message: notOpen.message }),
  "sync:remote": async () => {
    try {
      const here = await projectService().recentIds();
      const projects = (await syncService().list()).filter((p) => !p.deleted && !here.has(p.id));
      return { ok: true, projects: projects.map((p) => ({ id: p.id, name: p.name, board: p.board, updatedAt: p.updated_at, sizeBytes: p.size_bytes })) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Your account couldn't be read." };
    }
  },
  "sync:download": async (id) => {
    if (!isText(id) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id)) return { ok: false, message: "Refused: that isn't a project on your account." };
    let folder: string | null = null;
    try {
      const remote = await syncService().remote(id);
      if (!remote || remote.deleted) return { ok: false, message: "That project isn't on your account any more." };
      folder = await projectService().newFolder(remote.name || "Project");
      await syncService().download(id, folder);
      return projectService().openFolder(folder);
    } catch (error) {
      if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined);
      return { ok: false, message: error instanceof Error ? error.message : "That project couldn't be brought here." };
    }
  },
  "import:file": async () => {
    const options: Electron.OpenDialogOptions = { title: "Import a lab session", buttonLabel: "Import", properties: ["openFile"], filters: [{ name: "Kiungo lab session", extensions: ["json"] }] };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    const file = result.canceled ? null : result.filePaths[0];
    if (!file) return null;
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size > 5 * 1024 * 1024) return { ok: false, message: "That file is too big to be a lab session." };
    return importSessionText(projectService(), await readFile(file, "utf8"));
  },
  "import:account-list": () => listAccount(projectService(), accountClient()),
  "import:account": (kind, id) => {
    if ((kind !== "lab-session" && kind !== "phase-one-project") || !isText(id) || id.length > 64) return { ok: false, message: "Refused: that isn't something on your account." };
    return importFromAccount(projectService(), accountClient(), kind, id);
  },
  "world:read": (path) => (openProject(path) ? projectService().readWorld(path) : null),
  "world:write": (path, world) => (openProject(path) ? projectService().writeWorld(path, world) : notOpen),
  "update:status": () => updateService().info(),
  "update:check": () => updateService().check(true),
  "update:install": () => updateService().install(),
  "projects:choose-folder": async () => {
    const current = await projectService().settings();
    const folder = await chooseFolder({ title: "Where should new projects go?", buttonLabel: "Use this folder", defaultPath: current.projectsFolder, properties: ["openDirectory", "createDirectory"] });
    return folder ? projectService().setProjectsFolder(folder) : current;
  },
  "settings:set-appearance": (appearance) => {
    if (!(APPEARANCES as readonly string[]).includes(appearance)) throw new Error("Refused: that isn't a known appearance.");
    return projectService().setAppearance(appearance);
  },
  "settings:set-roles": (roles) => {
    if (!Array.isArray(roles) || roles.some((r) => !(ROLES as readonly string[]).includes(r))) throw new Error("Refused: that isn't a known set of roles.");
    return projectService().setRoles(roles);
  },
};

function registerIpc() {
  for (const channel of Object.keys(handlers)) {
    if (!isInvokeChannel(channel)) continue;
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      // Only our own interface may call the main process.
      const from = event.senderFrame?.url ?? "";
      if (!from.startsWith(`${APP_SCHEME}://`) && !(DEV_RENDERER_URL && from.startsWith(DEV_RENDERER_URL))) {
        throw new Error("Refused: the request didn't come from the Kiungo interface.");
      }
      return (handlers[channel] as (...a: unknown[]) => unknown)(...args);
    });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "Kiungo",
    icon: appIcon,
    backgroundColor: "#f6f8fb",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.once("ready-to-show", () => {
    // process.uptime() counts from the moment the operating system started the app.
    windowShownAt = process.uptime() * 1000;
    win.show();
    // scripts/measure-budgets.mjs: print the startup numbers once the app has settled, then quit.
    if (process.env.KIUNGO_MEASURE_BUDGETS) {
      setTimeout(() => {
        const processes = app.getAppMetrics().map((m) => ({ type: m.type, pid: m.pid, mb: Math.round(m.memory.workingSetSize / 1024) }));
        process.stdout.write(`KIUNGO_METRICS ${JSON.stringify({ ...handlers["app:metrics"](), processes })}\n`);
        setTimeout(() => app.quit(), 1500); // long enough for the script to read /proc for each pid
        return;
      }, Number(process.env.KIUNGO_MEASURE_BUDGETS) || 5000);
    }
  });
  // Links open in the user's browser; the window never leaves the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url) && URL.canParse(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const stayInApp = (event: Electron.Event, url: string) => {
    if (!url.startsWith(`${APP_SCHEME}://`) && !(DEV_RENDERER_URL && url.startsWith(DEV_RENDERER_URL))) event.preventDefault();
  };
  win.webContents.on("will-navigate", stayInApp);
  win.webContents.on("will-redirect", stayInApp);
  // No <webview> ever: it would be a second page outside these rules.
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  if (DEV_RENDERER_URL) void win.loadURL(DEV_RENDERER_URL);
  else void win.loadURL(`${APP_SCHEME}://app/index.html`);
}

// One Kiungo at a time: a second launch (or a kiungo:// link on Windows and Linux) hands its arguments to this one.
if (!app.requestSingleInstanceLock() && !process.env.KIUNGO_MEASURE_BUDGETS) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((a) => a.startsWith(`${LINK_SCHEME}://`));
    if (link) handleLink(link);
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
// macOS delivers links as an event, possibly before the app is ready.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleLink(url);
});
// The link a cold start was launched with (Windows and Linux).
for (const arg of process.argv) if (arg.startsWith(`${LINK_SCHEME}://`)) pendingLinks.push(arg);

function registerLinkScheme() {
  // In development the app is electron + this folder, so the scheme must name both.
  if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(LINK_SCHEME, process.execPath, [join(process.cwd(), process.argv[1])]);
  else app.setAsDefaultProtocolClient(LINK_SCHEME);
}

app.whenReady().then(() => {
  // A development copy on macOS shows Electron's icon in the Dock otherwise.
  if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(appIcon);
  // No camera, microphone or other device access until a feature asks the user for it (PCP-02).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  serveRenderer();
  registerIpc();
  registerLinkScheme();
  createWindow();
  updateService().start();
  activityReporter().start();
  void authService()
    .restore()
    .then(() => {
      for (const link of pendingLinks.splice(0)) void authService().handleLink(link);
    });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Finish every save before the app goes. A forced quit loses at most the change in flight: files are written whole or not at all.
let quitting = false;
function stopChildren() {
  void activity?.stop();
  updates?.stop();
  auth?.dispose();
  watcher?.stop();
  monitor?.stop();
  link?.stop();
}
/** Before Restart to update: the board's outputs go safe and every project is saved, so the installer can close the app at once. */
async function prepareToQuit(): Promise<void> {
  stopChildren();
  quitting = true;
  await projects?.closeAll();
}
app.on("will-quit", (event) => {
  stopChildren();
  if (quitting || !projects) return;
  event.preventDefault();
  quitting = true;
  void projects.closeAll().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
