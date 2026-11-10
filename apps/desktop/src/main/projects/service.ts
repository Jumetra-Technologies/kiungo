/**
 * Projects on disk (PRJ-01, DSK-10 to DSK-13): making them, opening them, the
 * recent list Home shows, and autosave.
 *
 * Plain Node, no Electron, so it runs in tests. The main process supplies the
 * folders and the dialogs.
 *
 * The interface is the less trusted side, so it never names a folder freely:
 * it opens projects from the recent list (kept here) or through a folder
 * dialog this process shows, and it can only save a project it has opened.
 */

import { lstat, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LabSession } from "@kiungo/core/lab/types";
import type { ImportKind } from "@kiungo/core/project";
import {
  buildStarter,
  CIRCUIT_FILE,
  circuitThumbnail,
  folderNameFor,
  HISTORY_FILE,
  parseCircuit,
  parseHistory,
  parseProjectMeta,
  PROJECT_FORMAT,
  PROJECT_FILE,
  PROJECT_VERSION,
  ProjectFileError,
  projectBoard,
  boardName,
  RECORDS_DIR,
  serializeCircuit,
  serializeProjectMeta,
  SKETCH_DIR,
  SKETCH_FILE,
  SKETCH_PROFILE_FILE,
  sketchProfile,
  StarterError,
  STATE_DIR,
  type HistoryFile,
  type ProjectMeta,
} from "@kiungo/core/project";
import { makeId, newSession } from "@kiungo/core/lab/session";
import { parseWorld, serializeWorld, WORLD_FILE } from "@kiungo/core/world/courses";
import type { WorldSpec } from "@kiungo/core/world/types";
import { APPEARANCES, ROLES, type Appearance, type NewProjectInput, type OpenResult, type ProjectHistory, type ProjectSettings, type RecentProject, type Role, type SavePayload, type SaveResult } from "@kiungo/api";
import { cleanTempFiles, writeFileAtomic } from "./atomic";

const MAX_RECENT = 30;
/** History kept on disk; the lab keeps the same number in memory. */
const MAX_HISTORY = 60;

interface RecentEntry {
  path: string;
  openedAt: string;
}

export interface ProjectServiceOptions {
  /** Where the app keeps its own files (recent list, settings). */
  appDataDir: string;
  /** The default projects folder: Documents/Kiungo. */
  defaultProjectsFolder: string;
  /** Written into the files: "Kiungo 0.3.0". */
  generator: string;
}

const describe = (error: unknown) => (error instanceof ProjectFileError || error instanceof StarterError ? error.message : null);

/** Saves for one project, one at a time, always writing the newest state. */
class ProjectWriter {
  private chain: Promise<unknown> = Promise.resolve();
  private next: Promise<SaveResult> | null = null;
  private latest: SavePayload | null = null;

  constructor(private readonly write: (payload: SavePayload) => Promise<SaveResult>) {}

  /** Queue a save. Saves made while one is writing are merged: only the newest is written. */
  save(payload: SavePayload): Promise<SaveResult> {
    this.latest = payload;
    if (!this.next) {
      const run = this.chain.then(() => {
        this.next = null;
        const data = this.latest!;
        this.latest = null;
        return this.write(data);
      });
      this.next = run;
      this.chain = run.catch(() => undefined);
    }
    return this.next;
  }

  /** Resolves once every queued save has been written. */
  async idle(): Promise<void> {
    while (this.next) await this.next.catch(() => undefined);
    await this.chain;
  }
}

export class ProjectService {
  private readonly open = new Map<string, { meta: ProjectMeta; writer: ProjectWriter }>();

  constructor(private readonly opts: ProjectServiceOptions) {}

  // ----- settings and the recent list --------------------------------------------

  private get settingsFile() {
    return join(this.opts.appDataDir, "settings.json");
  }
  private get recentFile() {
    return join(this.opts.appDataDir, "recent-projects.json");
  }

  async settings(): Promise<ProjectSettings> {
    try {
      const raw = JSON.parse(await readFile(this.settingsFile, "utf8")) as Partial<ProjectSettings>;
      return {
        projectsFolder: typeof raw.projectsFolder === "string" && raw.projectsFolder ? raw.projectsFolder : this.opts.defaultProjectsFolder,
        sync: raw.sync === true,
        appearance: (APPEARANCES as readonly string[]).includes(raw.appearance as string) ? (raw.appearance as Appearance) : "system",
        roles: Array.isArray(raw.roles) ? raw.roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r as string)) : [],
      };
    } catch {
      /* first run, or unreadable: the default */
    }
    return { projectsFolder: this.opts.defaultProjectsFolder, sync: false, appearance: "system", roles: [] };
  }

  private async writeSettings(next: ProjectSettings): Promise<ProjectSettings> {
    await writeFileAtomic(this.settingsFile, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  async setProjectsFolder(folder: string): Promise<ProjectSettings> {
    return this.writeSettings({ ...(await this.settings()), projectsFolder: resolve(folder) });
  }

  /** Sync with the account, for every project (DSK-14). */
  async setSync(enabled: boolean): Promise<ProjectSettings> {
    return this.writeSettings({ ...(await this.settings()), sync: enabled });
  }

  async setAppearance(appearance: Appearance): Promise<ProjectSettings> {
    return this.writeSettings({ ...(await this.settings()), appearance });
  }

  async setRoles(roles: Role[]): Promise<ProjectSettings> {
    const clean = roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    return this.writeSettings({ ...(await this.settings()), roles: clean });
  }

  /** A new, empty folder in the projects folder for a project called `name`. */
  async newFolder(name: string): Promise<string> {
    const { projectsFolder } = await this.settings();
    await mkdir(projectsFolder, { recursive: true });
    const folder = await this.freeFolder(projectsFolder, name);
    await mkdir(folder);
    return folder;
  }

  /** The ids of the projects in the recent list, read from their kiungo.json. */
  async recentIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const project of await this.recent()) {
      try {
        ids.add(parseProjectMeta(await readFile(join(project.path, PROJECT_FILE), "utf8")).id);
      } catch {
        /* moved or unreadable */
      }
    }
    return ids;
  }

  /** An open project's kiungo.json, as read. */
  metaOf(path: string): ProjectMeta | null {
    return this.open.get(path)?.meta ?? null;
  }

  private async readRecent(): Promise<RecentEntry[]> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.recentFile, "utf8"));
      if (!Array.isArray(raw)) return [];
      return raw.filter((e): e is RecentEntry => !!e && typeof e.path === "string" && typeof e.openedAt === "string").slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  }

  private async writeRecent(entries: RecentEntry[]): Promise<void> {
    await writeFileAtomic(this.recentFile, `${JSON.stringify(entries.slice(0, MAX_RECENT), null, 2)}\n`);
  }

  private async touchRecent(path: string): Promise<void> {
    const entries = (await this.readRecent()).filter((e) => e.path !== path);
    await this.writeRecent([{ path, openedAt: new Date().toISOString() }, ...entries]);
  }

  /** Home's list, newest first, each read fresh from its folder. */
  async recent(): Promise<RecentProject[]> {
    const entries = await this.readRecent();
    return Promise.all(
      entries.map(async (entry): Promise<RecentProject> => {
        try {
          const meta = parseProjectMeta(await readFile(join(entry.path, PROJECT_FILE), "utf8"));
          let thumbnail: RecentProject["thumbnail"] = null;
          try {
            const { session } = parseCircuit(await readFile(join(entry.path, CIRCUIT_FILE), "utf8"));
            thumbnail = circuitThumbnail(session.nodes, session.wires);
          } catch {
            /* no picture: still openable */
          }
          return { path: entry.path, name: meta.name, board: meta.board, boardName: boardName(meta.board), openedAt: entry.openedAt, thumbnail, missing: false };
        } catch {
          return { path: entry.path, name: null, board: null, boardName: null, openedAt: entry.openedAt, thumbnail: null, missing: true };
        }
      }),
    );
  }

  async forget(path: string): Promise<RecentProject[]> {
    await this.writeRecent((await this.readRecent()).filter((e) => e.path !== path));
    return this.recent();
  }

  async isRecent(path: string): Promise<boolean> {
    return (await this.readRecent()).some((e) => e.path === path);
  }

  // ----- making and opening -------------------------------------------------------

  /** A folder for a new project that doesn't exist yet: "Robot", then "Robot 2". */
  private async freeFolder(parent: string, name: string): Promise<string> {
    const base = folderNameFor(name);
    for (let n = 1; n < 1000; n++) {
      const candidate = join(parent, n === 1 ? base : `${base} ${n}`);
      try {
        await stat(candidate);
      } catch {
        return candidate;
      }
    }
    throw new ProjectFileError("Couldn't find a free folder name for the project.");
  }

  async create(input: NewProjectInput): Promise<OpenResult> {
    return this.make(input);
  }

  /**
   * A project from something made elsewhere (DSK-15): a Phase One lab
   * session becomes its circuit, with a blank sketch for its board, and any
   * notes go in records/. The session keeps its parts and wires as they were.
   */
  async importFrom(input: { name: string; board: string; session?: LabSession; records?: Array<{ name: string; content: string }>; source: { kind: ImportKind; id: string } }): Promise<OpenResult> {
    return this.make({ name: input.name, board: input.board, starter: null }, { session: input.session, records: input.records ?? [], source: input.source });
  }

  /** Recent projects already imported from this source: importing again makes a second copy, and says so. */
  async importedCopies(source: { kind: ImportKind; id: string }): Promise<string[]> {
    const names: string[] = [];
    for (const project of await this.recent()) {
      try {
        const meta = parseProjectMeta(await readFile(join(project.path, PROJECT_FILE), "utf8"));
        if (meta.importedFrom?.kind === source.kind && meta.importedFrom.id === source.id) names.push(meta.name);
      } catch {
        /* moved or unreadable: not a copy */
      }
    }
    return names;
  }

  private async make(input: NewProjectInput, from?: { session?: LabSession; records: Array<{ name: string; content: string }>; source: { kind: ImportKind; id: string } }): Promise<OpenResult> {
    const name = (typeof input.name === "string" ? input.name : "").trim().slice(0, 120) || "Untitled project";
    const board = projectBoard(input.board);
    if (!board) return { ok: false, message: "Choose a board for this project." };

    let build: ReturnType<typeof buildStarter>;
    try {
      build = buildStarter({ name, board: board.part, starter: input.starter });
    } catch (error) {
      return { ok: false, message: describe(error) ?? "Couldn't set up that starter." };
    }
    if (from?.session) build = { ...build, session: { ...from.session, name } };

    const { projectsFolder } = await this.settings();
    let folder: string | null = null;
    try {
      await mkdir(projectsFolder, { recursive: true });
      folder = await this.freeFolder(projectsFolder, name);
      await mkdir(folder);
      const at = new Date().toISOString();
      const meta: ProjectMeta = { format: PROJECT_FORMAT, version: PROJECT_VERSION, id: makeId("prj"), name, board: board.part, starter: input.starter, createdAt: at, updatedAt: at, generator: this.opts.generator, ...(from ? { importedFrom: from.source } : {}) };
      await writeFileAtomic(join(folder, SKETCH_DIR, SKETCH_FILE), build.code);
      await writeFileAtomic(join(folder, SKETCH_DIR, SKETCH_PROFILE_FILE), sketchProfile(board, build.libraries));
      await mkdir(join(folder, RECORDS_DIR), { recursive: true });
      for (const record of from?.records ?? []) await writeFileAtomic(join(folder, RECORDS_DIR, record.name), record.content);
      await writeFileAtomic(join(folder, CIRCUIT_FILE), serializeCircuit(build.session, this.opts.generator));
      // A robot starter's course.
      if (build.world) await writeFileAtomic(join(folder, WORLD_FILE), serializeWorld(build.world));
      // kiungo.json last: a folder with it is a whole project.
      await writeFileAtomic(join(folder, PROJECT_FILE), serializeProjectMeta(meta));
      await this.touchRecent(folder);
      this.open.set(folder, { meta, writer: this.writerFor(folder) });
      return { ok: true, project: { path: folder, meta, session: build.session, history: null, warnings: [] } };
    } catch (error) {
      if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") return { ok: false, message: `Kiungo isn't allowed to write in ${projectsFolder}. Choose another projects folder.` };
      if (code === "ENOSPC") return { ok: false, message: "The disk is full. Free some space and try again." };
      return { ok: false, message: describe(error) ?? "Couldn't make the project folder." };
    }
  }

  /** Open a project folder. Callers check that the interface may name it. */
  async openFolder(path: string): Promise<OpenResult> {
    const folder = resolve(path);
    // Kiungo writes into these: one that is a link would send those writes (and sync's reads) somewhere else on the computer.
    for (const entry of [PROJECT_FILE, CIRCUIT_FILE, WORLD_FILE, SKETCH_DIR, RECORDS_DIR, STATE_DIR]) {
      if ((await lstat(join(folder, entry)).catch(() => null))?.isSymbolicLink()) {
        return { ok: false, message: `Kiungo won't open this project: ${entry} in it is a link to somewhere else on the computer. Copy the real files into the project folder, then open it again.` };
      }
    }
    let meta: ProjectMeta;
    try {
      meta = parseProjectMeta(await readFile(join(folder, PROJECT_FILE), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, message: "That folder isn't a Kiungo project: it has no kiungo.json." };
      return { ok: false, message: describe(error) ?? "Couldn't read that project." };
    }
    await cleanTempFiles(folder);
    await cleanTempFiles(join(folder, STATE_DIR));

    let session = newSession({ name: meta.name });
    let warnings: string[] = [];
    try {
      const parsed = parseCircuit(await readFile(join(folder, CIRCUIT_FILE), "utf8"));
      session = parsed.session;
      warnings = parsed.warnings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { ok: false, message: describe(error) ?? "Couldn't read the project's circuit." };
      // No circuit yet: start with the board on its own.
      session = buildStarter({ name: meta.name, board: meta.board, starter: null }).session;
    }
    session = { ...session, name: meta.name, runtime: null };

    let history: ProjectHistory | null = null;
    try {
      const file = parseHistory(await readFile(join(folder, STATE_DIR, HISTORY_FILE), "utf8"));
      if (file) history = { past: file.past, future: file.future };
    } catch {
      /* no history: undo starts empty */
    }

    await this.touchRecent(folder);
    this.open.set(folder, { meta, writer: this.writerFor(folder) });
    return { ok: true, project: { path: folder, meta, session, history, warnings } };
  }

  // ----- saving -------------------------------------------------------------------

  private writerFor(folder: string): ProjectWriter {
    return new ProjectWriter((payload) => this.writeProject(folder, payload));
  }

  private async writeProject(folder: string, payload: SavePayload): Promise<SaveResult> {
    const entry = this.open.get(folder);
    if (!entry) return { ok: false, message: "This project isn't open." };
    const savedAt = new Date().toISOString();
    const name = typeof payload.session?.name === "string" && payload.session.name.trim() ? payload.session.name.trim().slice(0, 120) : entry.meta.name;
    const session = { ...payload.session, name, runtime: null };
    const history: HistoryFile = {
      version: 1,
      past: Array.isArray(payload.history?.past) ? payload.history.past.slice(-MAX_HISTORY) : [],
      future: Array.isArray(payload.history?.future) ? payload.history.future.slice(0, MAX_HISTORY) : [],
    };
    try {
      // Validate before writing: what reaches the disk must open again.
      parseCircuit(serializeCircuit(session, this.opts.generator));
      await writeFileAtomic(join(folder, CIRCUIT_FILE), serializeCircuit(session, this.opts.generator));
      await writeFileAtomic(join(folder, STATE_DIR, HISTORY_FILE), `${JSON.stringify(history)}\n`);
      if (name !== entry.meta.name || Date.parse(savedAt) - Date.parse(entry.meta.updatedAt) > 30_000) {
        entry.meta = { ...entry.meta, name, updatedAt: savedAt, generator: this.opts.generator };
        await writeFileAtomic(join(folder, PROJECT_FILE), serializeProjectMeta(entry.meta));
      }
      return { ok: true, savedAt };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { ok: false, message: "The project folder has gone: it was moved or deleted." };
      if (code === "ENOSPC") return { ok: false, message: "The disk is full. Free some space; your work is still here." };
      if (code === "EACCES" || code === "EPERM" || code === "EROFS") return { ok: false, message: "Kiungo isn't allowed to write in the project folder." };
      return { ok: false, message: describe(error) ?? "Couldn't save the project." };
    }
  }

  isOpen(path: string): boolean {
    return this.open.has(path);
  }

  /** How many projects are open: the activity reporter's "Home or a project". */
  openCount(): number {
    return this.open.size;
  }

  /** The project's world, or null when it has none (or it can't be read). */
  async readWorld(path: string): Promise<WorldSpec | null> {
    if (!this.open.has(path)) return null;
    return parseWorld(await readFile(join(path, WORLD_FILE), "utf8").catch(() => ""));
  }

  /** Save the world (obstacles moved, a world added). Crash-safe like every save. */
  async writeWorld(path: string, world: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.open.has(path)) return { ok: false, message: "This project isn't open." };
    const parsed = parseWorld(JSON.stringify(world));
    if (!parsed) return { ok: false, message: "That isn't a world Kiungo can save." };
    try {
      await writeFileAtomic(join(path, WORLD_FILE), serializeWorld(parsed));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: describe(error) ?? "Couldn't save the world." };
    }
  }

  /** The board an open project is written for (a lab part id), or null if it isn't open. */
  boardOf(path: string): string | null {
    return this.open.get(path)?.meta.board ?? null;
  }

  save(path: string, payload: SavePayload): Promise<SaveResult> {
    const entry = this.open.get(path);
    if (!entry) return Promise.resolve({ ok: false, message: "This project isn't open." });
    return entry.writer.save(payload);
  }

  async close(path: string): Promise<void> {
    const entry = this.open.get(path);
    if (!entry) return;
    await entry.writer.idle();
    this.open.delete(path);
  }

  /** Before quitting: finish every save. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.open.keys()].map((path) => this.close(path)));
  }
}
