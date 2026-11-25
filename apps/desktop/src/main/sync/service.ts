/**
 * Project sync on the desktop (DSK-14). The folder on disk is always the
 * working copy; sync is never needed to open, edit, build or run.
 *
 * Push: hash the project's files, compare with .kiungo/sync.json (the last
 * tree both sides agreed on), upload what the server lacks, and commit with
 * If-Match on the revision this copy started from.
 * Pull: when the server is newer, take what changed there; a file changed on
 * both sides keeps the local copy and gets the server's beside it.
 */

import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { SyncStatus } from "@kiungo/api";
import {
  conflictCopyPath,
  isSyncedPath,
  mergeTrees,
  parseSyncState,
  RECORDS_DIR,
  SKETCH_DIR,
  STATE_DIR,
  SYNC_MAX_FILE,
  SYNC_STATE_FILE,
  type SyncState,
  type Tree,
} from "@kiungo/core/project";
import { writeFileAtomic } from "../projects/atomic";
import { AccountProblem, type AccountClient } from "../account/client";

const BASE = "/auth/me/projects-sync";

export interface RemoteTree {
  id: string;
  name: string;
  board: string;
  revision: number;
  deleted: boolean;
  files: Array<{ path: string; sha256: string; size: number }>;
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const isSha = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/**
 * Where a project file goes, or null when it would land outside the project
 * folder or pass through a link (a folder in the project that points elsewhere).
 * Paths come from the server and from the project's own folder, so neither is trusted.
 */
async function insideProject(folder: string, path: string, kind: "synced" | "conflict-copy" = "synced"): Promise<string | null> {
  // A conflict copy can sit at the top (kiungo (from …).json), which isn't a synced path; it is still one plain name per folder.
  const plain = /^[^/\\\u0000-\u001f]+(\/[^/\\\u0000-\u001f]+){0,2}$/.test(path) && !path.split("/").some((p) => p === "." || p === ".." || p.startsWith("."));
  if (kind === "synced" ? !isSyncedPath(path) : !plain) return null;
  const root = resolve(folder);
  const full = resolve(root, ...path.split("/"));
  const rel = relative(root, full);
  if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`)) return null;
  // Every folder on the way, and the file itself if it's there, must be a real folder or file.
  let at = root;
  for (const part of rel.split(sep)) {
    at = join(at, part);
    const info = await lstat(at).catch(() => null);
    if (!info) break;
    if (info.isSymbolicLink()) return null;
  }
  return full;
}

/** Write a project file whole, making its folder if needed. */
async function put(folder: string, path: string, data: Uint8Array, kind: "synced" | "conflict-copy" = "synced"): Promise<void> {
  const full = await insideProject(folder, path, kind);
  if (!full) throw new AccountProblem(502, `Kiungo didn't write ${path}: it isn't a file a project can have.`);
  await mkdir(dirname(full), { recursive: true });
  await writeFileAtomic(full, data);
}

/** The server's tree for a project, checked: every path one a project can have, every hash a SHA-256. */
function serverTree(remote: RemoteTree | null): Tree {
  const tree: Tree = {};
  for (const f of remote?.files ?? []) {
    if (!f || typeof f.path !== "string" || !isSyncedPath(f.path) || !isSha(f.sha256)) {
      throw new AccountProblem(502, "Your account sent back a project file Kiungo won't write. Nothing was changed here.");
    }
    tree[f.path] = f.sha256;
  }
  return tree;
}

/** The project's synced files: path -> content. Files over the limit are reported, not sent. */
export async function readLocalTree(folder: string): Promise<{ files: Map<string, Uint8Array>; tooBig: string[] }> {
  const files = new Map<string, Uint8Array>();
  const tooBig: string[] = [];
  const add = async (path: string) => {
    if (!isSyncedPath(path)) return;
    // A link is never followed: it could point at anything on the computer, and this sends what it reads.
    const full = await insideProject(folder, path);
    if (!full) return;
    const info = await lstat(full).catch(() => null);
    if (!info?.isFile()) return;
    if (info.size > SYNC_MAX_FILE) {
      tooBig.push(path);
      return;
    }
    files.set(path, new Uint8Array(await readFile(full)));
  };
  for (const top of ["kiungo.json", "circuit.json", "world.json"]) await add(top);
  for (const name of await readdir(join(folder, SKETCH_DIR)).catch(() => [] as string[])) await add(`${SKETCH_DIR}/${name}`);
  for (const entry of await readdir(join(folder, RECORDS_DIR), { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile()) await add(`${RECORDS_DIR}/${entry.name}`);
    else if (entry.isDirectory()) for (const name of await readdir(join(folder, RECORDS_DIR, entry.name)).catch(() => [] as string[])) await add(`${RECORDS_DIR}/${entry.name}/${name}`);
  }
  return { files, tooBig };
}

export interface SyncServiceOptions {
  account: AccountClient;
  device: () => string;
  now?: () => Date;
}

export class SyncService {
  /** One sync per project at a time; a second call waits for the first. */
  private running = new Map<string, Promise<SyncStatus>>();

  constructor(private readonly opts: SyncServiceOptions) {}

  async readState(folder: string): Promise<SyncState | null> {
    return parseSyncState(await readFile(join(folder, STATE_DIR, SYNC_STATE_FILE), "utf8").catch(() => ""));
  }

  private async writeState(folder: string, state: SyncState): Promise<void> {
    await mkdir(join(folder, STATE_DIR), { recursive: true });
    await writeFileAtomic(join(folder, STATE_DIR, SYNC_STATE_FILE), `${JSON.stringify(state)}\n`);
  }

  /**
   * `open`: before the project is read, so the server's changes can be taken.
   * `push`: while it's open, only send this computer's changes; if the server
   * moved on, say so rather than change files under the open editor and lab.
   */
  sync(folder: string, project: { id: string; name: string; board: string }, mode: "open" | "push" = "push"): Promise<SyncStatus> {
    const busy = this.running.get(folder);
    if (busy) return busy.then(() => this.sync(folder, project, mode));
    const run = this.run(folder, project, mode).finally(() => this.running.delete(folder));
    this.running.set(folder, run);
    return run;
  }

  private async run(folder: string, project: { id: string; name: string; board: string }, mode: "open" | "push"): Promise<SyncStatus> {
    const at = (this.opts.now?.() ?? new Date()).toISOString();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const status = await this.once(folder, project, at, mode);
        if (status) return status;
      }
      return { state: "error", message: "The project kept changing on another computer while this one synced. Try again in a moment.", at };
    } catch (error) {
      if (error instanceof AccountProblem) {
        if (error.status === 0) return { state: "offline", message: "Offline: changes will sync when the connection is back.", at };
        if (error.status === 401) return { state: "signed-out", message: "Sign in to sync this project.", at };
        return { state: "error", message: error.message, at };
      }
      return { state: "error", message: "Sync stopped with a problem on this computer. Your files are unchanged.", at };
    }
  }

  /** One pass. Null when the server moved on during it: the caller tries again. */
  private async once(folder: string, project: { id: string; name: string; board: string }, at: string, mode: "open" | "push"): Promise<SyncStatus | null> {
    const { files, tooBig } = await readLocalTree(folder);
    const local: Tree = Object.fromEntries([...files].map(([p, data]) => [p, sha256(data)]));
    const state = await this.readState(folder);
    const remote = await this.remote(project.id);
    if (remote?.deleted) return { state: "removed", message: "This project was removed from your account. Sync it again to put it back.", at };
    if (mode === "push" && remote && remote.revision !== state?.revision) {
      return { state: "behind", message: "Changed on another computer. Close and reopen the project to bring those changes here.", at, revision: remote.revision };
    }

    const server = serverTree(remote);
    const base: Tree = state && remote && state.revision <= remote.revision ? state.files : {};
    const merge = remote ? mergeTrees(base, local, server) : { result: local, pull: {}, remove: [], conflicts: [], push: true };

    // Take the server's side first: what it changed, and the other side of each conflict.
    const fetched = new Map<string, Uint8Array>();
    for (const [path, hash] of Object.entries(merge.pull)) fetched.set(path, await this.blob(project.id, hash));
    for (const c of merge.conflicts) if (c.server) fetched.set(c.path, await this.blob(project.id, c.server));
    for (const [path, data] of fetched) {
      if (merge.pull[path]) await put(folder, path, data);
    }
    for (const path of merge.remove) {
      const full = await insideProject(folder, path);
      if (full) await rm(full, { force: true });
    }
    const copies: string[] = [];
    for (const c of merge.conflicts) {
      if (!c.server) continue;
      const copy = conflictCopyPath(c.path, this.opts.device(), new Date(at));
      const data = fetched.get(c.path)!;
      await put(folder, copy, data, "conflict-copy");
      copies.push(copy);
      // The other side goes back up beside it, so neither computer loses it. (A top-level copy isn't a synced path: it stays here.)
      if (isSyncedPath(copy)) {
        merge.result[copy] = sha256(data);
        files.set(copy, data);
        merge.push = true;
      }
    }

    let revision = remote?.revision ?? 0;
    if (merge.push) {
      const tree = merge.result;
      const contents = new Map<string, Uint8Array>();
      for (const [path, hash] of Object.entries(tree)) {
        const data = files.get(path) ?? fetched.get(path);
        if (data && sha256(data) === hash) contents.set(hash, data);
      }
      await this.upload(project.id, contents);
      const commit = await this.opts.account.request(`${BASE}/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        headers: { "If-Match": remote ? `"r${remote.revision}"` : "*" },
        body: { name: project.name, board: project.board, device: this.opts.device(), files: Object.entries(tree).map(([path, sha]) => ({ path, sha256: sha })) },
      });
      // Moved on meanwhile: what was pulled is on disk; go again against the server's new tree.
      if (commit.status === 409) return null;
      if (commit.status === 422) throw new AccountProblem(422, "Some files didn't reach the server. Try again.");
      revision = (commit.data as { revision: number }).revision;
    }
    await this.writeState(folder, { version: 1, revision, files: merge.result });
    return {
      state: copies.length ? "conflict" : "synced",
      at,
      revision,
      pulled: Object.keys(merge.pull).length + merge.remove.length,
      ...(copies.length ? { conflicts: copies, message: `Changed here and on another computer: kept yours, and saved the other as ${copies.join(", ")}.` } : {}),
      ...(tooBig.length ? { message: `Not synced (over 2 MB): ${tooBig.join(", ")}.` } : {}),
    };
  }

  async remote(id: string): Promise<RemoteTree | null> {
    try {
      return (await this.opts.account.get<RemoteTree>(`${BASE}/${encodeURIComponent(id)}`)) ?? null;
    } catch (error) {
      if (error instanceof AccountProblem && error.status === 404) return null;
      throw error;
    }
  }

  private async blob(id: string, hash: string): Promise<Uint8Array> {
    if (!isSha(hash)) throw new AccountProblem(502, "Your account named a file Kiungo can't fetch.");
    const res = await this.opts.account.request(`${BASE}/${encodeURIComponent(id)}/blobs/${hash}`, { raw: true });
    const data = res.data as Uint8Array;
    if (sha256(data) !== hash) throw new AccountProblem(502, "A file came back damaged. Try again.");
    return data;
  }

  private async upload(id: string, contents: Map<string, Uint8Array>): Promise<void> {
    if (!contents.size) return;
    const asked = await this.opts.account.request(`${BASE}/${encodeURIComponent(id)}/blobs/missing`, { method: "POST", body: { hashes: [...contents.keys()] } });
    const missing = ((asked.data as { missing?: string[] })?.missing ?? []).filter((h) => contents.has(h));
    for (let i = 0; i < missing.length; i += 20) {
      const batch = missing.slice(i, i + 20).map((h) => ({ sha256: h, base64: Buffer.from(contents.get(h)!).toString("base64") }));
      await this.opts.account.request(`${BASE}/${encodeURIComponent(id)}/blobs`, { method: "POST", body: batch });
    }
  }

  /** The account's synced projects. */
  async list(): Promise<Array<{ id: string; name: string; board: string; revision: number; updated_at: string | null; size_bytes: number; deleted: boolean }>> {
    const data = await this.opts.account.get<{ projects: Array<{ id: string; name: string; board: string; revision: number; updated_at: string | null; size_bytes: number; deleted: boolean }> }>(BASE);
    return data?.projects ?? [];
  }

  /** Put a project from the account into a new folder, ready to open. */
  async download(id: string, folder: string): Promise<RemoteTree> {
    const remote = await this.remote(id);
    if (!remote || remote.deleted) throw new AccountProblem(404, "That project isn't on your account any more.");
    const tree = serverTree(remote);
    for (const [path, hash] of Object.entries(tree)) await put(folder, path, await this.blob(id, hash));
    await mkdir(join(folder, RECORDS_DIR), { recursive: true });
    await this.writeState(folder, { version: 1, revision: remote.revision, files: tree });
    return remote;
  }
}
