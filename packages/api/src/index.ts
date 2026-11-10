/**
 * The contract between the desktop app's main process and its interface.
 *
 * The interface never touches Node or the file system. It calls the methods
 * on `window.kiungo`, which the preload script builds from INVOKE_CHANNELS,
 * and the main process answers each channel with the handler typed here.
 * Arguments are checked again in the main process, because the interface is
 * the less trusted side.
 */

import type { LabNode, LabSession, LabWire } from "@kiungo/core/lab/types";
import type { CircuitThumbnail, ProjectMeta } from "@kiungo/core/project";
import type { Diagnostic, ProfileLibrary } from "@kiungo/core/build";
import type { HardwareBoardId } from "@kiungo/core/hardware/boards";
import type { UploadProblem } from "@kiungo/core/hardware/upload";
import type { DetectedBoard } from "@kiungo/core/hardware/usb";
import type { WorldSpec } from "@kiungo/core/world/types";
import type { HybridPlan } from "@kiungo/core/hybrid/shim";
import type { SafeReason } from "@kiungo/core/hybrid/protocol";

export type Platform = "win32" | "linux" | "darwin";

export interface AppInfo {
  appVersion: string;
  platform: Platform;
  arch: string;
  versions: { electron: string; chrome: string; node: string };
}

export interface StartupMetrics {
  /** From the main process starting to the window being shown, in ms. */
  toWindowShownMs: number | null;
  /** Main process memory (resident set), in MB. */
  mainRssMb: number;
  /** Working set of every app process together, in MB: what the Phase Two memory budget measures. */
  totalMb: number;
}

export interface ToolchainStatus {
  /** The Arduino CLI the app found, if any. */
  cli: { found: true; version: string; path: string } | { found: false; hint: string };
  /** Board cores Arduino CLI has installed. */
  cores: Array<{ id: string; version: string }>;
}

export type ExampleSketch = "Blink";
export type EmulatedBoardId = "uno" | "nano";

export interface CompileResult {
  ok: boolean;
  /** Intel HEX of the program, ready for the emulator or an upload. */
  hex?: string;
  /** Flash and static RAM the program uses, as Arduino CLI reports them. */
  flash?: { used: number; max: number };
  ram?: { used: number; max: number };
  durationMs: number;
  /** Compiler output, for the build panel. */
  log: string;
}

export interface InstallResult {
  ok: boolean;
  durationMs: number;
  log: string;
}

/** Board cores the app may install. Versions are pinned so a project builds the same everywhere. */
export const INSTALLABLE_CORES = ["arduino:avr@1.8.6"] as const;
export type InstallableCore = (typeof INSTALLABLE_CORES)[number];

/** A project on Home: from the recent list, read fresh from its folder. */
export interface RecentProject {
  path: string;
  /** Null when the folder is gone or no longer a Kiungo project. */
  name: string | null;
  board: string | null;
  boardName: string | null;
  /** When it was last opened in Kiungo (ISO). */
  openedAt: string;
  thumbnail: CircuitThumbnail | null;
  missing: boolean;
}

/** Undo and redo for the open circuit. */
export interface ProjectHistory {
  past: Array<{ nodes: LabNode[]; wires: LabWire[] }>;
  future: Array<{ nodes: LabNode[]; wires: LabWire[] }>;
}

/** A project, opened: what the lab needs to show it. */
export interface OpenedProject {
  path: string;
  meta: ProjectMeta;
  session: LabSession;
  history: ProjectHistory | null;
  /** Parts or wires in circuit.json the lab couldn't use, already dropped. */
  warnings: string[];
  /** Things to know about a project just imported (DSK-15): a second copy, a board the desktop can't build for. */
  notes?: string[];
  /** How the sync on opening went, when sync is on (DSK-14). */
  sync?: SyncStatus;
}

/** Something on the person's website account that can become a desktop project (DSK-15). */
export interface ImportCandidate {
  kind: "lab-session" | "phase-one-project";
  id: string;
  name: string;
  /** "4 parts, Arduino Uno" or "Robotics project". */
  detail: string;
  updatedAt: string | null;
  /** Projects on this computer already imported from it. */
  copies: string[];
}

export type ImportList = { ok: true; items: ImportCandidate[] } | { ok: false; message: string };

export type OpenResult = { ok: true; project: OpenedProject } | { ok: false; message: string };

export interface NewProjectInput {
  name: string;
  /** A lab board part ("arduino-uno"); must be one of PROJECT_BOARDS. */
  board: string;
  /** A starter id, or null for a blank project. */
  starter: string | null;
}

export interface SavePayload {
  session: LabSession;
  history: ProjectHistory;
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; message: string };

/** Light or dark follows the computer; the other two hold regardless of it. */
export type Appearance = "system" | "light" | "dark";
export const APPEARANCES: readonly Appearance[] = ["system", "light", "dark"];

/** How someone works with Kiungo. A person can hold several; nav and dashboard modules show by role. */
export type Role = "student" | "embedded-engineer" | "researcher" | "electrical-engineer" | "stem-trainer" | "university" | "company" | "hobbyist";
export const ROLES: readonly Role[] = ["student", "embedded-engineer", "researcher", "electrical-engineer", "stem-trainer", "university", "company", "hobbyist"];
export const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  "embedded-engineer": "Embedded Systems Engineer",
  researcher: "Researcher",
  "electrical-engineer": "Electrical Engineer",
  "stem-trainer": "STEM Trainer",
  university: "University / College",
  company: "Company",
  hobbyist: "Hobbyist",
};

export interface ProjectSettings {
  /** Where new projects are made. Documents/Kiungo unless the user picked another folder. */
  projectsFolder: string;
  /** Keep a copy of projects on the signed-in account (DSK-14). Off until the person turns it on. */
  sync?: boolean;
  /** Light, dark, or the computer's own setting (the default). */
  appearance?: Appearance;
  /** How this person works with Kiungo. Empty until they pick any in Settings. */
  roles?: Role[];
}

/** A project's sync with the account (DSK-14). */
export interface SyncStatus {
  /**
   * off: sync isn't on. synced: this copy and the account agree. behind: the
   * account has newer changes, taken next time the project opens. conflict:
   * a file changed in both places; the other copy is saved beside it.
   */
  state: "off" | "syncing" | "synced" | "behind" | "conflict" | "offline" | "signed-out" | "removed" | "error";
  at: string;
  message?: string;
  revision?: number;
  /** Files taken from the account. */
  pulled?: number;
  /** Where the other side of each conflict was saved. */
  conflicts?: string[];
}

/** A project on the account that isn't on this computer. */
export interface RemoteProject {
  id: string;
  name: string;
  board: string;
  updatedAt: string | null;
  sizeBytes: number;
}

/** Who is signed in to this copy of Kiungo (DSK-01 to DSK-03). */
export interface AccountUser {
  id: string;
  email: string;
  name: string;
  photoUrl: string | null;
}

/**
 * The sign-in state the interface shows.
 * - `signed-out`: nobody; `canSkip` is true when signing in can't start (offline, or the
 *   service isn't there), so the app can still be used.
 * - `waiting`: the browser is open on the website's sign-in page.
 * - `signed-in`: `offline` while the session can't be checked; it still counts.
 */
export type AuthState =
  | { status: "signed-out"; message: string | null; canSkip: boolean; skipped: boolean }
  | { status: "waiting"; startedAt: string; expiresAt: string; signInUrl: string }
  | { status: "signed-in"; user: AccountUser; deviceName: string; offline: boolean; secureStorage: boolean };

/** A file in a project's sketch folder. */
export interface SketchFile {
  name: string;
  /** The main file: named after the folder, can't be renamed or deleted. */
  main: boolean;
  size: number;
}

export type SketchResult = { ok: true } | { ok: false; message: string };

/** A project's build (BLD-01, BLD-02, ERR-01). */
export interface BuildResult {
  ok: boolean;
  /** Compiler and linker problems, mapped to the sketch's files and lines. */
  diagnostics: Diagnostic[];
  /** The program as Intel HEX, when the build worked. */
  hex?: string;
  flash?: { used: number; max: number };
  ram?: { used: number; max: number };
  durationMs: number;
  /** Why the build couldn't run at all (no Arduino CLI, no internet the first time), in plain words. */
  message?: string;
  /** Nothing in the sketch changed since the last good build, so that one was used. */
  cached?: boolean;
  /** A Hybrid build: what Kiungo's layer adds over the sketch alone (HWT-02, HWT-04). */
  overhead?: { flash: number; ram: number };
  /** A Hybrid build: the Ship build's use, the sketch without Kiungo: what the board runs in the end (HWT-03). */
  ship?: { flash: { used: number; max: number }; ram: { used: number; max: number } };
  /** Everything the compiler said, for the build log. */
  log: string;
}

/** A library in the Arduino library index. */
export interface LibraryInfo {
  name: string;
  version: string;
  /** One line on what it does, from the library's own description. */
  sentence: string;
  author: string;
  website: string | null;
}

export type LibrarySearchResult = { ok: true; libraries: LibraryInfo[] } | { ok: false; message: string };

/** Boards on USB (HW-01). `message` when finding boards can't work at all. */
export interface BoardsState {
  boards: DetectedBoard[];
  message: string | null;
}

/** Why a board might not show up, and what to do (FIX-09). */
export interface PortHint {
  id: "brltty" | "dialout" | "no-port" | "driver-ch340" | "driver-cp210x" | "cable";
  title: string;
  steps: string[];
  links?: Array<{ label: string; url: string }>;
}

/** An upload (BLD-06): it stops at the build (with its problems) or at the upload (with recovery steps). */
export interface UploadResult {
  ok: boolean;
  stage: "build" | "upload";
  build: BuildResult;
  problem?: UploadProblem;
  log: string;
  durationMs: number;
  /** The serial monitor was open on this port and was reopened after the upload. */
  monitorReopened?: boolean;
}

export type SerialOpenResult = { ok: true } | { ok: false; message: string };

/** After adding or removing: the sketch's libraries, as sketch.yaml now pins them. */
export type LibraryChange = { ok: true; libraries: ProfileLibrary[]; added: string[] } | { ok: false; message: string };

/**
 * Kiungo's own updates, downloaded and installed inside the app. Windows (the
 * NSIS installer) and the Linux AppImage update themselves; macOS waits for
 * signing (DSK-80), and the .deb and .rpm packages update from the website.
 */
export type UpdateState =
  /** This copy can't update itself: `downloadUrl` is where a new version comes from instead. */
  | { status: "unsupported"; reason: "development" | "platform" | "disabled"; message: string; downloadUrl: string }
  | { status: "idle"; checkedAt: string | null }
  | { status: "checking"; checkedAt: string | null }
  | { status: "up-to-date"; checkedAt: string }
  | { status: "downloading"; version: string; percent: number; checkedAt: string }
  /** Downloaded and checked: it installs on Restart to update, or the next time Kiungo quits. */
  | { status: "ready"; version: string; checkedAt: string }
  /** `quiet` when a check nobody asked for failed: the interface doesn't show it. */
  | { status: "error"; message: string; quiet: boolean; checkedAt: string | null };

export interface UpdateInfo {
  currentVersion: string;
  /** "beta" or "stable": the releases this copy follows. */
  channel: string;
  state: UpdateState;
}

export type UpdateInstallResult = { ok: true } | { ok: false; message: string };

/** Every request the interface can make, with its arguments and its answer. */
export interface InvokeMap {
  "app:info": { args: []; result: AppInfo };
  "app:metrics": { args: []; result: StartupMetrics };
  "toolchain:status": { args: []; result: ToolchainStatus };
  "toolchain:compile-example": { args: [sketch: ExampleSketch, board: EmulatedBoardId]; result: CompileResult };
  "toolchain:install-core": { args: [core: InstallableCore]; result: InstallResult };
  "projects:recent": { args: []; result: RecentProject[] };
  "projects:create": { args: [input: NewProjectInput]; result: OpenResult };
  /** Open a project from the recent list. Other paths are refused: the interface never names arbitrary folders. */
  "projects:open-recent": { args: [path: string]; result: OpenResult };
  /** Ask for a folder and open it; null if the user cancelled. */
  "projects:open-dialog": { args: []; result: OpenResult | null };
  /** Save the open project's circuit and history. Only a project opened in this window can be saved. */
  "projects:save": { args: [path: string, payload: SavePayload]; result: SaveResult };
  /** Wait for pending saves, then let the project go. */
  "projects:close": { args: [path: string]; result: void };
  "projects:forget": { args: [path: string]; result: RecentProject[] };
  "projects:reveal": { args: [path: string]; result: void };
  "projects:settings": { args: []; result: ProjectSettings };
  /** Ask for a new projects folder; returns the settings, changed or not. */
  "projects:choose-folder": { args: []; result: ProjectSettings };
  /** Light, dark, or follow the computer. */
  "settings:set-appearance": { args: [appearance: Appearance]; result: ProjectSettings };
  /** Which roles this person works under. Replaces the whole list. */
  "settings:set-roles": { args: [roles: Role[]]; result: ProjectSettings };
  "auth:state": { args: []; result: AuthState };
  /** Open the website's sign-in page in the browser and wait for it to send the app back. */
  "auth:sign-in": { args: []; result: AuthState };
  /** Stop waiting for the browser. */
  "auth:cancel": { args: []; result: AuthState };
  /** End this computer's session. Projects on disk are never touched. */
  "auth:sign-out": { args: []; result: AuthState };
  /** Use Kiungo without signing in, when signing in can't start. */
  "auth:skip": { args: []; result: AuthState };
  /** The open project's sketch files, main file first. */
  "sketch:list": { args: [projectPath: string]; result: SketchFile[] };
  "sketch:read": { args: [projectPath: string, name: string]; result: { ok: true; content: string } | { ok: false; message: string } };
  /** Save a file whole (crash-safe). */
  "sketch:write": { args: [projectPath: string, name: string, content: string]; result: SketchResult };
  "sketch:create": { args: [projectPath: string, name: string]; result: SketchResult };
  "sketch:rename": { args: [projectPath: string, from: string, to: string]; result: SketchResult };
  /** Move a file to the computer's trash, so it can be got back. */
  "sketch:delete": { args: [projectPath: string, name: string]; result: SketchResult };
  /** Build the open project with its sketch.yaml profile. One build per project at a time: a second call gets the first's answer. */
  "build:compile": { args: [projectPath: string]; result: BuildResult };
  /** The libraries the open project's sketch.yaml pins. */
  "libraries:list": { args: [projectPath: string]; result: ProfileLibrary[] };
  /** Search the Arduino library index for libraries that work on AVR boards. */
  "libraries:search": { args: [query: string]; result: LibrarySearchResult };
  /** Pin a library, and the libraries it needs, in the open project's sketch.yaml. No version means the newest. */
  "libraries:add": { args: [projectPath: string, name: string, version?: string]; result: LibraryChange };
  /** Unpin a library, and the libraries only it needed. */
  "libraries:remove": { args: [projectPath: string, name: string]; result: LibraryChange };
  /** What's plugged in now; starts watching USB the first time. */
  "boards:list": { args: []; result: BoardsState };
  /** Why a board might not show up (FIX-09). */
  "boards:doctor": { args: []; result: PortHint[] };
  /** Open one of the driver pages the hints name. Other addresses are refused. */
  "boards:open-link": { args: [url: string]; result: void };
  /** Open a vendor's page in the person's browser, for shopping the Marketplace (SHOP-01). Only known vendor hosts are opened. */
  "marketplace:open-vendor-link": { args: [url: string]; result: void };
  /** Build the open project for the board, then upload to the port. The port must be plugged in now. */
  "upload:start": { args: [projectPath: string, port: string, board: HardwareBoardId]; result: UploadResult };
  /** Open the serial monitor on a plugged-in port. One port at a time. */
  "serial:open": { args: [port: string, baud: number]; result: SerialOpenResult };
  /** Send text to the board, as typed (add the line ending you want). */
  "serial:write": { args: [text: string]; result: boolean };
  "serial:close": { args: []; result: void };
  /**
   * A Hybrid run (RUN-01): build the open project with Kiungo's layer for the
   * board, upload it to the port, and open the link. `ok` means the link is up;
   * otherwise it stopped at the build or the upload, as an upload does.
   */
  "hybrid:start": { args: [projectPath: string, port: string, board: HardwareBoardId, plan: HybridPlan]; result: UploadResult };
  /** Values for the virtual parts: [sensor id, value] pairs. Only changes reach the board. */
  "hybrid:set": { args: [pairs: Array<[number, number]>]; result: void };
  /** Text for the sketch's Serial.read(), as typed in the serial monitor. */
  "hybrid:serial-in": { args: [text: string]; result: boolean };
  /** End the run: the board's outputs go to the safe state, then the link closes. */
  "hybrid:stop": { args: []; result: void };
  /** Every output of the real board off at once, and held off until the next upload (SAF-01). */
  "hybrid:emergency-stop": { args: []; result: void };
  /** Turn sync with the account on or off for every project (DSK-14). */
  "sync:set-enabled": { args: [enabled: boolean]; result: ProjectSettings };
  /** Sync the open project now. */
  "sync:now": { args: [projectPath: string]; result: SyncStatus };
  /** Projects on the account that aren't on this computer. */
  "sync:remote": { args: []; result: { ok: true; projects: RemoteProject[] } | { ok: false; message: string } };
  /** Bring one of them to this computer and open it. */
  "sync:download": { args: [id: string]; result: OpenResult };
  /** Import a lab session file (.kiungo.json) saved from the website (DSK-15). Null if the person cancelled. */
  "import:file": { args: []; result: OpenResult | null };
  /** The lab sessions and projects on the signed-in person's website account. */
  "import:account-list": { args: []; result: ImportList };
  /** Import one of them as a new project. */
  "import:account": { args: [kind: ImportCandidate["kind"], id: string]; result: OpenResult };
  /** The open project's world (world.json), or null when it has none. */
  "world:read": { args: [projectPath: string]; result: WorldSpec | null };
  /** Save the open project's world. */
  "world:write": { args: [projectPath: string, world: WorldSpec]; result: SketchResult };
  /** Where Kiungo's own update stands. */
  "update:status": { args: []; result: UpdateInfo };
  /** Look for a new version now; one that's found downloads in the background. */
  "update:check": { args: []; result: UpdateInfo };
  /** Save everything, quit, install the downloaded version and open it. Refused while a board is running or uploading. */
  "update:install": { args: []; result: UpdateInstallResult };
}

/** Messages the main process sends the interface, unasked. */
export interface EventMap {
  "auth:changed": AuthState;
  "boards:changed": DetectedBoard[];
  "upload:stage": { projectPath: string; stage: "building" | "uploading" };
  "serial:data": { port: string; text: string };
  /** The monitor stopped without being asked; `message` says why, if known. */
  "serial:closed": { port: string; message: string | null };
  /** A project's sync status changed. */
  "sync:status": { projectPath: string; status: SyncStatus };
  /** The Hybrid link (sprint 9): the sketch's Serial lines, what it drove, the handshake, or that the link closed. */
  "hybrid:link": HybridLinkEvent;
  /** Kiungo's own update moved on: checking, downloading, ready to install. */
  "update:changed": UpdateInfo;
}

export interface HybridLinkEvent {
  port: string;
  lines: string[];
  /** Pin levels as bits (bit n is pin n), the pins the sketch has written, and the PWM duty (0 to 255) on PWM pins. */
  out?: { levels: number; driven: number; pwm: Array<[number, number]> };
  hello?: { protocol: number; compatible: boolean };
  /** The board's outputs are in the safe state, and why. */
  safe?: SafeReason;
  closed?: string | null;
}

export type EventChannel = keyof EventMap;
export const EVENT_CHANNELS = ["auth:changed", "boards:changed", "upload:stage", "serial:data", "serial:closed", "hybrid:link", "sync:status", "update:changed"] as const satisfies readonly EventChannel[];

export function isEventChannel(value: unknown): value is EventChannel {
  return typeof value === "string" && (EVENT_CHANNELS as readonly string[]).includes(value);
}

export type InvokeChannel = keyof InvokeMap;

export const INVOKE_CHANNELS = [
  "app:info",
  "app:metrics",
  "toolchain:status",
  "toolchain:compile-example",
  "toolchain:install-core",
  "projects:recent",
  "projects:create",
  "projects:open-recent",
  "projects:open-dialog",
  "projects:save",
  "projects:close",
  "projects:forget",
  "projects:reveal",
  "projects:settings",
  "projects:choose-folder",
  "settings:set-appearance",
  "settings:set-roles",
  "auth:state",
  "auth:sign-in",
  "auth:cancel",
  "auth:sign-out",
  "auth:skip",
  "sketch:list",
  "sketch:read",
  "sketch:write",
  "sketch:create",
  "sketch:rename",
  "sketch:delete",
  "build:compile",
  "libraries:list",
  "libraries:search",
  "libraries:add",
  "libraries:remove",
  "boards:list",
  "boards:doctor",
  "boards:open-link",
  "marketplace:open-vendor-link",
  "upload:start",
  "serial:open",
  "serial:write",
  "serial:close",
  "hybrid:start",
  "hybrid:set",
  "hybrid:serial-in",
  "hybrid:stop",
  "hybrid:emergency-stop",
  "import:file",
  "sync:set-enabled",
  "sync:now",
  "sync:remote",
  "sync:download",
  "import:account-list",
  "import:account",
  "world:read",
  "world:write",
  "update:status",
  "update:check",
  "update:install",
] as const satisfies readonly InvokeChannel[];

/** Fails to compile when a channel in InvokeMap is missing from INVOKE_CHANNELS (the preload would refuse it). */
type UnlistedChannel = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>;
export const EVERY_CHANNEL_LISTED: [UnlistedChannel] extends [never] ? true : UnlistedChannel = true;

export const EXAMPLE_SKETCHES: readonly ExampleSketch[] = ["Blink"];
export const EMULATED_BOARDS: readonly EmulatedBoardId[] = ["uno", "nano"];

/** What `window.kiungo` looks like in the interface. */
export interface KiungoBridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeMap[C]["args"]): Promise<InvokeMap[C]["result"]>;
  /** Listen for a message from the main process; returns a function that stops listening. */
  on<E extends EventChannel>(channel: E, listener: (payload: EventMap[E]) => void): () => void;
}

export type Handler<C extends InvokeChannel> = (...args: InvokeMap[C]["args"]) => Promise<InvokeMap[C]["result"]> | InvokeMap[C]["result"];
export type Handlers = { [C in InvokeChannel]: Handler<C> };

export function isInvokeChannel(value: unknown): value is InvokeChannel {
  return typeof value === "string" && (INVOKE_CHANNELS as readonly string[]).includes(value);
}
