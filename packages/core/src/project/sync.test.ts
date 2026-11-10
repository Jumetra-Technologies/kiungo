import { describe, expect, it } from "vitest";
import {
  SYNC_MAX_FILE,
  SYNC_MAX_PROJECT,
  SYNC_STATE_FILE,
  conflictCopyPath,
  isSyncedPath,
  mergeTrees,
  parseSyncState,
} from "./sync";

const sha = (c: string) => c.repeat(64);

describe("project sync", () => {
  it("syncs the project's own files, never local history or anything outside", () => {
    for (const p of [
      "kiungo.json",
      "circuit.json",
      "world.json",
      "sketch/sketch.ino",
      "sketch/motor.h",
      "records/notes.md",
      "records/run 1/log.csv",
    ])
      expect(isSyncedPath(p), p).toBe(true);
    for (const p of [
      ".kiungo/history.json",
      "../escape",
      "sketch/../kiungo.json",
      "sketch/a/b/c.ino",
      "other.txt",
      "sketch/.hidden",
      SYNC_STATE_FILE,
    ])
      expect(isSyncedPath(p), p).toBe(false);
    expect(SYNC_MAX_FILE).toBe(2 * 1024 * 1024);
    expect(SYNC_MAX_PROJECT).toBe(10 * SYNC_MAX_FILE);
  });

  it("reads its own state file, keeping only synced paths with real hashes", () => {
    const state = parseSyncState(
      JSON.stringify({
        version: 1,
        revision: 4,
        files: { "kiungo.json": sha("a"), ".kiungo/x": sha("b"), "sketch/s.ino": "not-a-hash" },
      }),
    );
    expect(state).toEqual({ version: 1, revision: 4, files: { "kiungo.json": sha("a") } });
    expect(parseSyncState("{")).toBeNull();
    expect(parseSyncState(JSON.stringify({ version: 2, revision: 1, files: {} }))).toBeNull();
    expect(parseSyncState(JSON.stringify({ version: 1, files: {} }))).toBeNull();
  });

  it("three-way merges: each side's changes, removals and conflicts", () => {
    const base = { a: sha("1"), b: sha("1"), c: sha("1"), d: sha("1"), e: sha("1") };
    const local = { a: sha("2"), b: sha("1"), c: sha("1"), d: sha("3"), f: sha("1") };
    const server = { a: sha("1"), b: sha("2"), d: sha("4"), e: sha("1"), g: sha("1") };
    const m = mergeTrees(base, local, server);
    expect(m.result).toEqual({ a: sha("2"), b: sha("2"), d: sha("3"), f: sha("1"), g: sha("1") });
    expect(m.pull).toEqual({ b: sha("2"), g: sha("1") });
    expect(m.remove).toEqual(["c"]);
    expect(m.conflicts).toEqual([{ path: "d", server: sha("4") }]);
    expect(m.push).toBe(true);
  });

  it("an edit beats a removal on the other side, and nothing to do means nothing to push", () => {
    const base = { x: sha("1") };
    expect(mergeTrees(base, {}, { x: sha("2") })).toMatchObject({
      result: { x: sha("2") },
      pull: { x: sha("2") },
      conflicts: [],
    });
    expect(mergeTrees(base, { x: sha("2") }, {})).toMatchObject({
      result: { x: sha("2") },
      conflicts: [{ path: "x", server: null }],
    });
    expect(mergeTrees(base, base, base).push).toBe(false);
  });

  it("puts the server's side of a conflict beside the local file; code gets .txt so it isn't built", () => {
    const when = new Date(2026, 10, 10);
    expect(conflictCopyPath("records/notes.md", "Ann's Laptop", when)).toBe(
      "records/notes (from Anns Laptop 10 Nov).md",
    );
    expect(conflictCopyPath("sketch/sketch.ino", "Lab PC", when)).toBe(
      "sketch/sketch.ino (from Lab PC 10 Nov).txt",
    );
    expect(conflictCopyPath("kiungo.json", "!!!", when)).toBe(
      "kiungo (from another computer 10 Nov).json",
    );
  });
});
