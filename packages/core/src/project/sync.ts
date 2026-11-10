/**
 * Project sync, the parts that are pure logic (DSK-14; the API is
 * jumetra-backend docs/sync-api.md). The folder on disk is always the working
 * copy; the account keeps a copy. `.kiungo/sync.json` holds the last tree both
 * sides agreed on, so each side's changes can be told apart:
 *
 * - a file changed on one side only is taken from that side;
 * - a file changed on both is a conflict: the local file stays, and the
 *   server's is written beside it under another name. Nothing is overwritten
 *   without the person seeing it.
 */

/** path -> SHA-256 (lowercase hex). */
export type Tree = Record<string, string>;

export interface SyncState {
  version: 1;
  /** The server revision this tree is. */
  revision: number;
  files: Tree;
}

export const SYNC_STATE_FILE = "sync.json";
/** Limits, as the server keeps them. */
export const SYNC_MAX_FILE = 2 * 1024 * 1024;
export const SYNC_MAX_PROJECT = 20 * 1024 * 1024;

const NAME = "[A-Za-z0-9_][A-Za-z0-9 _.()+-]{0,99}";
const SYNCED = new RegExp(`^(kiungo\\.json|circuit\\.json|world\\.json|sketch/${NAME}|records/${NAME}(/${NAME})?)$`);

/** Whether a path inside a project syncs. `.kiungo/` (local undo history and this state) never does. */
export function isSyncedPath(path: string): boolean {
  return !path.includes("..") && SYNCED.test(path);
}

export function parseSyncState(text: string): SyncState | null {
  try {
    const raw = JSON.parse(text) as Partial<SyncState>;
    if (raw?.version !== 1 || typeof raw.revision !== "number" || !raw.files || typeof raw.files !== "object") return null;
    const files: Tree = {};
    for (const [path, sha] of Object.entries(raw.files)) if (isSyncedPath(path) && typeof sha === "string" && /^[0-9a-f]{64}$/.test(sha)) files[path] = sha;
    return { version: 1, revision: raw.revision, files };
  } catch {
    return null;
  }
}

export interface Merge {
  /** The tree to commit. */
  result: Tree;
  /** Files to take from the server: write these (sha) locally. */
  pull: Tree;
  /** Files the server removed and this computer didn't change: remove locally. */
  remove: string[];
  /** Files changed on both sides, differently: the local one is kept, the server's goes beside it. */
  conflicts: Array<{ path: string; server: string | null }>;
  /** Whether the result differs from the server's tree (something to commit). */
  push: boolean;
}

/** Three-way merge of the last agreed tree, this computer's and the server's. */
export function mergeTrees(base: Tree, local: Tree, server: Tree): Merge {
  const result: Tree = {};
  const pull: Tree = {};
  const remove: string[] = [];
  const conflicts: Merge["conflicts"] = [];
  for (const path of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)])) {
    const b = base[path] ?? null;
    const l = local[path] ?? null;
    const s = server[path] ?? null;
    if (l === s) {
      if (l) result[path] = l;
    } else if (l === b) {
      // Changed (or removed) on the server only.
      if (s) {
        result[path] = s;
        pull[path] = s;
      } else remove.push(path);
    } else if (s === b) {
      // Changed (or removed) here only.
      if (l) result[path] = l;
    } else {
      // Both changed it. A side that removed it loses to the side that edited it.
      if (l) result[path] = l;
      else if (s) {
        result[path] = s;
        pull[path] = s;
        continue;
      }
      conflicts.push({ path, server: s });
    }
  }
  const same = (a: Tree, c: Tree) => Object.keys(a).length === Object.keys(c).length && Object.entries(a).every(([p, h]) => c[p] === h);
  return { result, pull, remove, conflicts, push: !same(result, server) };
}

/**
 * Where the server's side of a conflict goes, beside the local file. A
 * sketch's copy gets .txt on the end, so Arduino CLI doesn't build it as a
 * second sketch file.
 */
export function conflictCopyPath(path: string, device: string, when: Date): string {
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const who = device.replace(/[^A-Za-z0-9 _.+-]/g, "").trim().slice(0, 30) || "another computer";
  const day = `${when.getDate()} ${when.toLocaleString("en-US", { month: "short" })}`;
  const dot = file.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ""];
  const code = /\.(ino|cpp|c|h|hpp|S)$/.test(file);
  return `${dir}${code ? `${file} (from ${who} ${day}).txt` : `${stem} (from ${who} ${day})${ext}`}`;
}
