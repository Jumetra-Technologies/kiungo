// @vitest-environment node
/**
 * Project sync on the desktop (DSK-14) against an in-memory account that
 * keeps the server's rules (docs/sync-api.md in jumetra-backend): revisions,
 * If-Match and 409, blobs by hash. And importing Phase One work (DSK-15).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStarter, conflictCopyPath, isSyncedPath, mergeTrees } from "@kiungo/core/project";
import { toSessionFile as sessionFile } from "@kiungo/core/lab/session-file";
import { AccountClient } from "../src/main/account/client";
import { importFromAccount, importSessionText, listAccount } from "../src/main/account/import";
import { ProjectService } from "../src/main/projects/service";
import { SyncService } from "../src/main/sync/service";

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

/** The account: one person's synced projects, plus Phase One lab sessions and projects. */
function fakeAccount() {
  const projects = new Map<string, { name: string; board: string; revision: number; deleted: boolean; files: Record<string, string> }>();
  const blobs = new Map<string, Uint8Array>();
  const phaseOne = { sessions: [] as unknown[], projects: [] as Array<Record<string, unknown>> };
  let online = true;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    if (!online) throw new TypeError("fetch failed");
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/auth/me/lab-sessions") return json(200, phaseOne.sessions);
    if (path === "/auth/me/projects") return json(200, phaseOne.projects);
    const one = path.match(/^\/auth\/me\/projects\/([^/]+)$/);
    if (one) return json(200, phaseOne.projects.find((p) => p.id === decodeURIComponent(one[1])));
    if (path === "/auth/me/projects-sync") return json(200, { projects: [...projects].map(([id, p]) => ({ id, name: p.name, board: p.board, revision: p.revision, updated_at: null, size_bytes: 0, deleted: p.deleted })) });
    const m = path.match(/^\/auth\/me\/projects-sync\/([^/]+)(\/blobs(\/missing|\/([0-9a-f]{64}))?)?$/);
    if (!m) return json(404, { detail: "no route" });
    const id = decodeURIComponent(m[1]);
    const project = projects.get(id);
    const tree = () => ({ id, name: project!.name, board: project!.board, revision: project!.revision, deleted: project!.deleted, files: Object.entries(project!.files).map(([p, h]) => ({ path: p, sha256: h, size: blobs.get(h)!.length })) });
    if (m[3] === "/missing") return json(200, { missing: (body.hashes as string[]).filter((h) => !blobs.has(h)) });
    if (m[4]) return blobs.has(m[4]) ? new Response(blobs.get(m[4]) as BodyInit, { status: 200 }) : json(404, { detail: "no blob" });
    if (m[2] && method === "POST") {
      for (const b of body as Array<{ sha256: string; base64: string }>) blobs.set(b.sha256, new Uint8Array(Buffer.from(b.base64, "base64")));
      return json(200, {});
    }
    if (method === "GET") return project ? json(200, tree(), { ETag: `"r${project.revision}"` }) : json(404, { detail: "not here" });
    if (method === "PUT") {
      const match = (init.headers as Record<string, string>)["If-Match"];
      if (project && match !== `"r${project.revision}"`) return json(409, { detail: "moved on", tree: tree() });
      if (!project && match !== "*") return json(404, { detail: "gone" });
      const files: Record<string, string> = Object.fromEntries((body.files as Array<{ path: string; sha256: string }>).map((f) => [f.path, f.sha256]));
      const missing = Object.values(files).filter((h) => !blobs.has(h));
      if (missing.length) return json(422, { missing });
      const revision = (project?.revision ?? 0) + 1;
      projects.set(id, { name: body.name, board: body.board, revision, deleted: false, files });
      return json(200, { revision });
    }
    return json(405, {});
  }) as typeof fetch;
  const client = new AccountClient({ apiBase: "https://api.test", token: async () => "token", fetch: fetchImpl });
  return {
    projects,
    blobs,
    phaseOne,
    client,
    offline: () => (online = false),
    online: () => (online = true),
    /** Another computer edits a file on the account. */
    edit(id: string, path: string, text: string) {
      const p = projects.get(id)!;
      const data = new TextEncoder().encode(text);
      blobs.set(sha(data), data);
      p.files = { ...p.files, [path]: sha(data) };
      p.revision++;
    },
  };
}

async function projectOnDisk() {
  const root = mkdtempSync(join(tmpdir(), "kiungo-sync-"));
  const projects = new ProjectService({ appDataDir: join(root, "app"), defaultProjectsFolder: join(root, "Documents", "Kiungo"), generator: "Kiungo test" });
  const made = await projects.create({ name: "Rover", board: "arduino-uno", starter: "blink" });
  if (!made.ok) throw new Error(made.message);
  return { root, projects, folder: made.project.path, meta: made.project.meta };
}

describe("the sync merge (pure)", () => {
  const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64);
  it("takes each side's own changes, and flags a file changed on both", () => {
    const m = mergeTrees({ "x": A, "y": A, "z": A }, { "x": B, "y": A, "z": B, "new": C }, { "x": A, "y": C, "z": C });
    expect(m.result).toEqual({ x: B, y: C, z: B, new: C });
    expect(m.pull).toEqual({ y: C });
    expect(m.conflicts).toEqual([{ path: "z", server: C }]);
    expect(m.push).toBe(true);
  });
  it("a file removed on one side and unchanged on the other goes; edited beats removed", () => {
    expect(mergeTrees({ x: A }, {}, { x: A }).result).toEqual({});
    expect(mergeTrees({ x: A }, { x: A }, {}).remove).toEqual(["x"]);
    expect(mergeTrees({ x: A }, {}, { x: B })).toMatchObject({ result: { x: B }, pull: { x: B }, conflicts: [] });
    expect(mergeTrees({ x: A }, { x: A }, { x: A }).push).toBe(false);
  });
  it("only a project's own files sync, and a sketch's conflict copy isn't built as code", () => {
    expect(isSyncedPath("sketch/sketch.ino")).toBe(true);
    expect(isSyncedPath(".kiungo/history.json")).toBe(false);
    expect(isSyncedPath("sketch/../x")).toBe(false);
    const copy = conflictCopyPath("sketch/sketch.ino", "BRAD/THINKPAD", new Date("2026-11-02T10:00:00Z"));
    expect(copy).toBe("sketch/sketch.ino (from BRADTHINKPAD 2 Nov).txt");
    expect(isSyncedPath(copy)).toBe(true);
    expect(conflictCopyPath("circuit.json", "PC", new Date("2026-11-02T10:00:00Z"))).toBe("circuit (from PC 2 Nov).json");
  });
});

describe("syncing a project with the account (DSK-14)", () => {
  it("the first sync puts the project's own files on the account, and nothing local-only", async () => {
    const account = fakeAccount();
    const { folder, meta } = await projectOnDisk();
    const sync = new SyncService({ account: account.client, device: () => "LAPTOP" });
    const status = await sync.sync(folder, meta, "push");
    expect(status).toMatchObject({ state: "synced", revision: 1 });
    const files = Object.keys(account.projects.get(meta.id)!.files).sort();
    expect(files).toContain("kiungo.json");
    expect(files).toContain("sketch/sketch.ino");
    expect(files.some((f) => f.startsWith(".kiungo"))).toBe(false);
    // Nothing changed: nothing sent.
    expect(await sync.sync(folder, meta, "push")).toMatchObject({ state: "synced", revision: 1 });
    writeFileSync(join(folder, "sketch", "sketch.ino"), "// changed\n");
    expect(await sync.sync(folder, meta, "push")).toMatchObject({ state: "synced", revision: 2 });
  });

  it("while a project is open, a newer copy online is reported, not written under the editor", async () => {
    const account = fakeAccount();
    const { folder, meta } = await projectOnDisk();
    const sync = new SyncService({ account: account.client, device: () => "LAPTOP" });
    await sync.sync(folder, meta, "push");
    account.edit(meta.id, "sketch/sketch.ino", "// from the desktop PC\n");
    const before = readFileSync(join(folder, "sketch", "sketch.ino"), "utf8");
    expect(await sync.sync(folder, meta, "push")).toMatchObject({ state: "behind" });
    expect(readFileSync(join(folder, "sketch", "sketch.ino"), "utf8")).toBe(before);
    // On the next open, it's taken.
    expect(await sync.sync(folder, meta, "open")).toMatchObject({ state: "synced", revision: 2, pulled: 1 });
    expect(readFileSync(join(folder, "sketch", "sketch.ino"), "utf8")).toBe("// from the desktop PC\n");
  });

  it("a file changed in both places keeps this computer's and saves the other beside it", async () => {
    const account = fakeAccount();
    const { folder, meta } = await projectOnDisk();
    const sync = new SyncService({ account: account.client, device: () => "DESKTOP-PC", now: () => new Date("2026-11-02T10:00:00Z") });
    await sync.sync(folder, meta, "push");
    account.edit(meta.id, "sketch/sketch.ino", "// theirs\n");
    writeFileSync(join(folder, "sketch", "sketch.ino"), "// mine\n");
    const status = await sync.sync(folder, meta, "open");
    expect(status.state).toBe("conflict");
    expect(status.conflicts).toEqual(["sketch/sketch.ino (from DESKTOP-PC 2 Nov).txt"]);
    expect(readFileSync(join(folder, "sketch", "sketch.ino"), "utf8")).toBe("// mine\n");
    expect(readFileSync(join(folder, "sketch", "sketch.ino (from DESKTOP-PC 2 Nov).txt"), "utf8")).toBe("// theirs\n");
    // Both are on the account now, so nothing is lost on either side.
    const files = account.projects.get(meta.id)!.files;
    expect(files["sketch/sketch.ino"]).toBe(sha("// mine\n"));
    expect(files["sketch/sketch.ino (from DESKTOP-PC 2 Nov).txt"]).toBe(sha("// theirs\n"));
  });

  it("offline, sync waits and the files are untouched", async () => {
    const account = fakeAccount();
    const { folder, meta } = await projectOnDisk();
    account.offline();
    expect(await new SyncService({ account: account.client, device: () => "X" }).sync(folder, meta, "push")).toMatchObject({ state: "offline" });
    expect(existsSync(join(folder, ".kiungo", "sync.json"))).toBe(false);
  });

  it("brings a project from the account to a new folder on this computer", async () => {
    const account = fakeAccount();
    const { folder, meta, root } = await projectOnDisk();
    await new SyncService({ account: account.client, device: () => "A" }).sync(folder, meta, "push");
    const other = join(root, "Other", "Rover");
    const sync = new SyncService({ account: account.client, device: () => "B" });
    await sync.download(meta.id, other);
    expect(readFileSync(join(other, "sketch", "sketch.ino"), "utf8")).toBe(readFileSync(join(folder, "sketch", "sketch.ino"), "utf8"));
    expect(await sync.sync(other, meta, "push")).toMatchObject({ state: "synced", revision: 1 });
  });
});

describe("importing Phase One work (DSK-15)", () => {
  it("a lab session file becomes a project with the same circuit and a blank sketch for its board", async () => {
    const { projects } = await projectOnDisk();
    const { session } = buildStarter({ name: "Distance", board: "arduino-uno", starter: "distance" });
    const text = JSON.stringify(sessionFile({ ...session, name: "My distance lab" }));
    const result = await importSessionText(projects, text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.meta).toMatchObject({ name: "My distance lab", board: "arduino-uno", importedFrom: { kind: "session-file" } });
    expect(result.project.session.nodes.map((n) => n.partId)).toEqual(["arduino-uno", "hc-sr04"]);
    expect(result.project.session.wires.length).toBe(session.wires.length);
    // The same file again: a second copy, and it says so.
    const again = await importSessionText(projects, text);
    expect(again.ok && again.project.notes?.[0]).toMatch(/imported this before/);
  });

  it("refuses a file that isn't a lab session", async () => {
    const { projects } = await projectOnDisk();
    expect(await importSessionText(projects, '{"hello": 1}')).toEqual({ ok: false, message: expect.any(String) });
  });

  it("lists the account's lab sessions and projects, and imports each", async () => {
    const account = fakeAccount();
    const { projects } = await projectOnDisk();
    const { session } = buildStarter({ name: "x", board: "arduino-uno", starter: "servo" });
    account.phaseOne.sessions.push({ ...session, id: "ses-1", name: "Servo sweep" });
    account.phaseOne.projects.push({ id: "p-1", name: "Weather station", description: "Logs the weather.", objectives: "Read a DHT11.", category: "iot", hardware: [{ name: "DHT11", quantity: 1 }], teammates: [{ name: "Ada", role: "Wiring" }], updated_at: "2026-10-01T00:00:00Z" });
    const list = await listAccount(projects, account.client);
    expect(list.ok && list.items.map((i) => [i.kind, i.name])).toEqual([
      ["lab-session", "Servo sweep"],
      ["phase-one-project", "Weather station"],
    ]);
    const lab = await importFromAccount(projects, account.client, "lab-session", "ses-1");
    expect(lab.ok && lab.project.session.nodes.some((n) => n.partId === "servo")).toBe(true);
    const site = await importFromAccount(projects, account.client, "phase-one-project", "p-1");
    expect(site.ok).toBe(true);
    if (!site.ok) return;
    const about = readFileSync(join(site.project.path, "records", "about.md"), "utf8");
    expect(about).toContain("# Weather station");
    expect(about).toContain("- DHT11");
    expect(about).toContain("- Ada, Wiring");
    const after = await listAccount(projects, account.client);
    expect(after.ok && after.items.every((i) => i.copies.length === 1)).toBe(true);
  });
});

describe("what the account sends is checked before it touches the disk (security audit)", () => {
  it("a file path that climbs out of the project is never written, and nothing is changed", async () => {
    const account = fakeAccount();
    const { root, folder, meta } = await projectOnDisk();
    const sync = new SyncService({ account: account.client, device: () => "Lab PC" });
    expect((await sync.sync(folder, meta, "open")).state).toBe("synced");
    // A bad or compromised server names a file outside the project folder.
    account.edit(meta.id, "../../escaped.txt", "pwned");
    account.edit(meta.id, "sketch/sketch.ino", "void setup() {}\nvoid loop() { /* from the other computer */ }\n");
    const before = readFileSync(join(folder, "sketch", "sketch.ino"), "utf8");
    const status = await sync.sync(folder, meta, "open");
    expect(status).toMatchObject({ state: "error", message: expect.stringMatching(/won't write/) });
    expect(existsSync(join(folder, "..", "..", "escaped.txt"))).toBe(false);
    expect(existsSync(join(root, "escaped.txt"))).toBe(false);
    expect(readFileSync(join(folder, "sketch", "sketch.ino"), "utf8")).toBe(before);
  });

  it("downloading a project with a path outside it writes nothing outside it", async () => {
    const account = fakeAccount();
    const { root, folder, meta } = await projectOnDisk();
    const sync = new SyncService({ account: account.client, device: () => "Lab PC" });
    await sync.sync(folder, meta, "open");
    account.edit(meta.id, "records/../../../escaped.txt", "pwned");
    const target = join(root, "Downloaded");
    await expect(sync.download(meta.id, target)).rejects.toThrow(/won't write/);
    expect(existsSync(join(root, "escaped.txt"))).toBe(false);
  });

  it("a hash that isn't a SHA-256 is never put in a request", async () => {
    const account = fakeAccount();
    const { folder, meta } = await projectOnDisk();
    const sync = new SyncService({ account: account.client, device: () => "Lab PC" });
    await sync.sync(folder, meta, "open");
    account.projects.get(meta.id)!.files["sketch/notes.txt"] = "../../../auth/me";
    account.projects.get(meta.id)!.revision++;
    account.blobs.set("../../../auth/me", new Uint8Array());
    const asked: string[] = [];
    const request = account.client.request.bind(account.client);
    account.client.request = (path, init) => (asked.push(path), request(path, init));
    expect((await sync.sync(folder, meta, "open")).state).toBe("error");
    expect(asked.some((p) => p.includes(".."))).toBe(false);
  });

  it("a link in the project is never followed: what it points at isn't uploaded, and nothing is written through it", async () => {
    const account = fakeAccount();
    const { root, folder, meta } = await projectOnDisk();
    const secret = join(root, "id_rsa");
    writeFileSync(secret, "PRIVATE KEY");
    symlinkSync(secret, join(folder, "sketch", "keys.txt"));
    const outside = join(root, "elsewhere");
    mkdirSync(outside);
    mkdirSync(join(folder, "records"), { recursive: true });
    symlinkSync(outside, join(folder, "records", "lab"));
    const sync = new SyncService({ account: account.client, device: () => "Lab PC" });
    expect((await sync.sync(folder, meta, "open")).state).toBe("synced");
    expect([...account.blobs.values()].some((b) => new TextDecoder().decode(b).includes("PRIVATE KEY"))).toBe(false);
    expect(Object.keys(account.projects.get(meta.id)!.files)).not.toContain("sketch/keys.txt");
    // The account then sends a file "inside" that linked folder.
    account.edit(meta.id, "records/lab/run.sh", "evil");
    expect((await sync.sync(folder, meta, "open")).state).toBe("error");
    expect(readdirSync(outside)).toEqual([]);
  });
});
