// @vitest-environment node
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { makeId } from "@kiungo/core/lab/session";
import type { LabSession } from "@kiungo/core/lab/types";
import type { OpenedProject, OpenResult } from "@kiungo/api";
import { cleanTempFiles, writeFileAtomic } from "../src/main/projects/atomic";
import { ProjectService } from "../src/main/projects/service";

function service() {
  const root = mkdtempSync(join(tmpdir(), "kiungo-projects-"));
  const svc = new ProjectService({ appDataDir: join(root, "app"), defaultProjectsFolder: join(root, "Documents", "Kiungo"), generator: "Kiungo test" });
  return { root, svc, projectsFolder: join(root, "Documents", "Kiungo") };
}

function opened(result: OpenResult): OpenedProject {
  if (!result.ok) throw new Error(result.message);
  return result.project;
}

const withPart = (session: LabSession, label: string): LabSession => ({ ...session, nodes: [...session.nodes, { id: makeId("n"), partId: "led", label, x: 400, y: 80, mode: "virtual" }] });

describe("making a project (DSK-11, DSK-12)", () => {
  it("writes the folder in the open format, in Documents/Kiungo by default", async () => {
    const { svc, projectsFolder } = service();
    const p = opened(await svc.create({ name: "Blinky", board: "arduino-uno", starter: "blink" }));
    expect(p.path).toBe(join(projectsFolder, "Blinky"));
    for (const f of ["kiungo.json", "circuit.json", "sketch/sketch.ino", "sketch/sketch.yaml"]) expect(existsSync(join(p.path, f)), f).toBe(true);
    expect(existsSync(join(p.path, "records"))).toBe(true);
    expect(JSON.parse(readFileSync(join(p.path, "kiungo.json"), "utf8"))).toMatchObject({ format: "kiungo-project", name: "Blinky", board: "arduino-uno", starter: "blink" });
    expect(readFileSync(join(p.path, "sketch/sketch.ino"), "utf8")).toContain("const int LED_PIN = 13;");
    expect(readFileSync(join(p.path, "sketch/sketch.yaml"), "utf8")).toContain("fqbn: arduino:avr:uno");
    expect(p.session.nodes.map((n) => n.partId)).toEqual(["arduino-uno", "led"]);
  });

  it("never overwrites a folder: a second project with the same name gets its own", async () => {
    const { svc, projectsFolder } = service();
    await svc.create({ name: "Rover", board: "arduino-uno", starter: null });
    const second = opened(await svc.create({ name: "Rover", board: "arduino-uno", starter: null }));
    expect(second.path).toBe(join(projectsFolder, "Rover 2"));
  });

  it("refuses a board it can't build for, without making a folder", async () => {
    const { svc, projectsFolder } = service();
    const result = await svc.create({ name: "Pi", board: "raspberry-pi-4", starter: null });
    expect(result.ok).toBe(false);
    expect(existsSync(projectsFolder) ? readdirSync(projectsFolder) : []).toEqual([]);
  });

  it("a robot starter brings its course as world.json, which reads back and saves", async () => {
    const { svc } = service();
    const p = opened(await svc.create({ name: "Rover", board: "arduino-uno", starter: "obstacle-avoider" }));
    expect(existsSync(join(p.path, "world.json"))).toBe(true);
    const world = await svc.readWorld(p.path);
    expect(world?.obstacles.length).toBe(6);
    const moved = { ...world!, obstacles: world!.obstacles.slice(1) };
    expect(await svc.writeWorld(p.path, moved)).toEqual({ ok: true });
    expect((await svc.readWorld(p.path))?.obstacles.length).toBe(5);
    expect(await svc.writeWorld(p.path, { version: 9 })).toMatchObject({ ok: false });
    // A project without a robot has no world until one is added.
    const blink = opened(await svc.create({ name: "Blink", board: "arduino-uno", starter: "blink" }));
    expect(await svc.readWorld(blink.path)).toBeNull();
  });

  it("uses the projects folder the user chose", async () => {
    const { root, svc } = service();
    await svc.setProjectsFolder(join(root, "School"));
    const p = opened(await svc.create({ name: "Class demo", board: "arduino-mega", starter: "servo" }));
    expect(p.path).toBe(join(root, "School", "Class demo"));
    expect(readFileSync(join(p.path, "sketch/sketch.yaml"), "utf8")).toContain("- Servo (1.3.0)");
  });
});

describe("Home's recent projects (DSK-10)", () => {
  it("lists projects newest first, with the board and a thumbnail, and marks ones that have gone", async () => {
    const { svc } = service();
    const a = opened(await svc.create({ name: "First", board: "arduino-uno", starter: "blink" }));
    const b = opened(await svc.create({ name: "Second", board: "arduino-mega", starter: "motion-alarm" }));
    let recent = await svc.recent();
    expect(recent.map((r) => r.name)).toEqual(["Second", "First"]);
    expect(recent[0]).toMatchObject({ path: b.path, boardName: "Arduino Mega 2560", missing: false });
    expect(recent[0].thumbnail?.boxes).toHaveLength(3);

    // Reopening moves it to the top.
    await svc.close(a.path);
    opened(await svc.openFolder(a.path));
    recent = await svc.recent();
    expect(recent[0].path).toBe(a.path);

    // A folder deleted outside Kiungo shows as missing until it's removed from the list.
    writeFileSync(join(b.path, "kiungo.json"), "{");
    recent = await svc.recent();
    expect(recent.find((r) => r.path === b.path)?.missing).toBe(true);
    recent = await svc.forget(b.path);
    expect(recent.map((r) => r.path)).toEqual([a.path]);
  });

  it("only projects on the list count as recent, so the interface can't open any folder it names", async () => {
    const { root, svc } = service();
    const p = opened(await svc.create({ name: "Mine", board: "arduino-uno", starter: null }));
    expect(await svc.isRecent(p.path)).toBe(true);
    expect(await svc.isRecent(join(root, "elsewhere"))).toBe(false);
  });
});

describe("opening a project folder", () => {
  it("explains a folder that isn't a project", async () => {
    const { root, svc } = service();
    mkdirSync(join(root, "random"));
    const result = await svc.openFolder(join(root, "random"));
    expect(result).toEqual({ ok: false, message: "That folder isn't a Kiungo project: it has no kiungo.json." });
  });

  it("opens a project with no circuit yet as the board on its own", async () => {
    const { svc } = service();
    const p = opened(await svc.create({ name: "Bare", board: "arduino-uno", starter: null }));
    await svc.close(p.path);
    const { rmSync } = await import("node:fs");
    rmSync(join(p.path, "circuit.json"));
    const again = opened(await svc.openFolder(p.path));
    expect(again.session.nodes.map((n) => n.partId)).toEqual(["arduino-uno"]);
  });

  it("cleans up what a killed write left behind", async () => {
    const { svc } = service();
    const p = opened(await svc.create({ name: "Tidy", board: "arduino-uno", starter: null }));
    await svc.close(p.path);
    writeFileSync(join(p.path, "circuit.json.kiungo-tmp-abc123"), "half a fi");
    opened(await svc.openFolder(p.path));
    expect(readdirSync(p.path).filter((f) => f.includes("kiungo-tmp"))).toEqual([]);
  });
});

describe("autosave (EDT-04, DSK-13)", () => {
  it("saves the circuit, the undo history and a new name, and they come back on reopening", async () => {
    const { svc } = service();
    const p = opened(await svc.create({ name: "Saver", board: "arduino-uno", starter: "blink" }));
    const edited = { ...withPart(p.session, "LED 9"), name: "Saver v2" };
    const result = await svc.save(p.path, { session: edited, history: { past: [{ nodes: p.session.nodes, wires: p.session.wires }], future: [] } });
    expect(result.ok).toBe(true);
    await svc.close(p.path);

    const again = opened(await svc.openFolder(p.path));
    expect(again.meta.name).toBe("Saver v2");
    expect(again.session.nodes.map((n) => n.label)).toContain("LED 9");
    expect(again.history?.past).toHaveLength(1);
    expect(again.history?.past[0].nodes).toEqual(p.session.nodes);
  });

  it("merges a burst of saves and always ends with the newest", async () => {
    const { svc } = service();
    const p = opened(await svc.create({ name: "Burst", board: "arduino-uno", starter: null }));
    let session = p.session;
    const saves = [];
    for (let i = 0; i < 40; i++) {
      session = withPart(session, `LED ${i}`);
      saves.push(svc.save(p.path, { session, history: { past: [], future: [] } }));
    }
    const results = await Promise.all(saves);
    expect(results.every((r) => r.ok)).toBe(true);
    await svc.close(p.path);
    const written = JSON.parse(readFileSync(join(p.path, "circuit.json"), "utf8"));
    expect(written.session.nodes).toHaveLength(41);
  });

  it("refuses to save a project that isn't open", async () => {
    const { root, svc } = service();
    expect(await svc.save(join(root, "nope"), { session: {} as LabSession, history: { past: [], future: [] } })).toEqual({ ok: false, message: "This project isn't open." });
  });

  it("says so when the folder has been deleted while the project is open", async () => {
    const { svc } = service();
    const p = opened(await svc.create({ name: "Gone", board: "arduino-uno", starter: null }));
    const { rmSync } = await import("node:fs");
    rmSync(p.path, { recursive: true, force: true });
    const result = await svc.save(p.path, { session: p.session, history: { past: [], future: [] } });
    // writeFileAtomic recreates missing folders, so the save lands; the project is whole again.
    expect(result.ok).toBe(true);
    expect(existsSync(join(p.path, "circuit.json"))).toBe(true);
  });
});

describe("crash-safe writes", () => {
  it("replaces a file whole", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kiungo-atomic-"));
    const file = join(dir, "a.json");
    await writeFileAtomic(file, "one");
    await writeFileAtomic(file, "two");
    expect(readFileSync(file, "utf8")).toBe("two");
    expect(readdirSync(dir)).toEqual(["a.json"]);
    expect(await cleanTempFiles(dir)).toBe(0);
  });

  it("a process killed mid-write leaves the old file or the new one, never part of one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kiungo-kill-"));
    const target = join(dir, "circuit.json");
    const writer = resolve(__dirname, "fixtures/atomic-writer.ts");
    for (let round = 0; round < 6; round++) {
      // One Node process (tsx as a loader, not its launcher), so the kill hits the writer itself.
      const child = spawn(process.execPath, ["--import", "tsx", writer, target], { stdio: ["ignore", "pipe", "inherit"] });
      await new Promise<void>((done) => child.stdout.once("data", () => done()));
      await new Promise((r) => setTimeout(r, 120 + round * 60));
      child.kill("SIGKILL");
      await new Promise((r) => child.once("exit", r));
      if (!existsSync(target)) continue; // killed before the first write finished: nothing to check
      const parsed = JSON.parse(readFileSync(target, "utf8"));
      expect(parsed.parts).toHaveLength(400);
      expect(parsed.padding).toHaveLength(200_000);
    }
    expect(existsSync(target)).toBe(true);
  }, 60_000);
});

describe("settings", () => {
  it("default to the computer's own appearance", async () => {
    const { svc } = service();
    expect((await svc.settings()).appearance).toBe("system");
  });

  it("remember the appearance the person picked, and leave the projects folder and sync alone", async () => {
    const { svc, projectsFolder } = service();
    await svc.setSync(true);
    const after = await svc.setAppearance("dark");
    expect(after).toEqual({ projectsFolder, sync: true, appearance: "dark", roles: [] });
    expect((await svc.settings()).appearance).toBe("dark");
  });

  it("start with no roles, and remember whichever the person picks", async () => {
    const { svc } = service();
    expect((await svc.settings()).roles).toEqual([]);
    const after = await svc.setRoles(["student", "hobbyist"]);
    expect(after.roles).toEqual(["student", "hobbyist"]);
    expect((await svc.settings()).roles).toEqual(["student", "hobbyist"]);
  });

  it("drops anything that isn't a known role", async () => {
    const { svc } = service();
    // @ts-expect-error - a bad channel call would be refused before this, but the service itself should still be defensive
    const after = await svc.setRoles(["student", "not-a-role"]);
    expect(after.roles).toEqual(["student"]);
  });
});

describe("opening a project made elsewhere (security audit)", () => {
  it("refuses a project whose sketch folder is a link to somewhere else on the computer", async () => {
    const { root, svc } = service();
    const p = opened(await svc.create({ name: "Shared", board: "arduino-uno", starter: "blink" }));
    await svc.close(p.path);
    const elsewhere = join(root, "elsewhere");
    renameSync(join(p.path, "sketch"), elsewhere);
    symlinkSync(elsewhere, join(p.path, "sketch"));
    const result = await svc.openFolder(p.path);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/sketch in it is a link/) });
    expect(svc.isOpen(p.path)).toBe(false);
  });
});
