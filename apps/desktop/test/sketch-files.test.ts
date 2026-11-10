// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFileName, SketchFiles, starterFor } from "../src/main/projects/sketch";

function project() {
  const dir = mkdtempSync(join(tmpdir(), "kiungo-sketch-"));
  mkdirSync(join(dir, "sketch"));
  writeFileSync(join(dir, "sketch", "sketch.ino"), "void setup() {}\nvoid loop() {}\n");
  writeFileSync(join(dir, "sketch", "sketch.yaml"), "profiles: {}\n");
  const trashed: string[] = [];
  return { dir, files: new SketchFiles(async (p) => void trashed.push(p)), trashed };
}

describe("sketch file names", () => {
  it("accepts what Arduino builds and refuses paths, odd extensions and Kiungo's own file", () => {
    for (const ok of ["motor.h", "motor.cpp", "util_2.c", "notes.md", "sketch.ino"]) expect(checkFileName(ok), ok).toBeNull();
    for (const bad of ["../escape.h", "a/b.h", "a\\b.h", "..h", ".hidden.h", "my file.h", "virus.exe", "sketch.yaml", "", " a.h", "x".repeat(70) + ".h", "con:.h"]) expect(checkFileName(bad), bad).not.toBeNull();
  });

  it("headers start with an include guard", () => {
    expect(starterFor("motor-driver.h")).toContain("#ifndef MOTOR_DRIVER_H\n#define MOTOR_DRIVER_H");
    expect(starterFor("motor.cpp")).toBe("#include <Arduino.h>\n");
  });
});

describe("the sketch folder (EDT-01)", () => {
  it("lists the code, main file first, and leaves sketch.yaml out", async () => {
    const { dir, files } = project();
    writeFileSync(join(dir, "sketch", "zeta.h"), "");
    writeFileSync(join(dir, "sketch", "alpha.cpp"), "");
    writeFileSync(join(dir, "sketch", "photo.png"), "");
    expect((await files.list(dir)).map((f) => f.name)).toEqual(["sketch.ino", "alpha.cpp", "zeta.h"]);
    expect((await files.list(dir))[0].main).toBe(true);
  });

  it("saves whole files and reads them back", async () => {
    const { dir, files } = project();
    expect(await files.write(dir, "sketch.ino", "// new\n")).toEqual({ ok: true });
    expect(await files.read(dir, "sketch.ino")).toEqual({ ok: true, content: "// new\n" });
  });

  it("refuses to write outside the sketch", async () => {
    const { dir, files } = project();
    expect((await files.write(dir, "../kiungo.json", "{}")).ok).toBe(false);
    expect(existsSync(join(dir, "kiungo.json"))).toBe(false);
  });

  it("makes new files without overwriting, and keeps one .ino", async () => {
    const { dir, files } = project();
    expect(await files.create(dir, "motor.h")).toEqual({ ok: true });
    expect(readFileSync(join(dir, "sketch", "motor.h"), "utf8")).toContain("#ifndef MOTOR_H");
    expect(await files.create(dir, "motor.h")).toEqual({ ok: false, message: "There's already a file called motor.h." });
    expect((await files.create(dir, "second.ino")).ok).toBe(false);
  });

  it("renames, but never the main file and never over another", async () => {
    const { dir, files } = project();
    await files.create(dir, "a.h");
    await files.create(dir, "b.h");
    expect(await files.rename(dir, "a.h", "c.h")).toEqual({ ok: true });
    expect(await files.rename(dir, "c.h", "b.h")).toEqual({ ok: false, message: "There's already a file called b.h." });
    expect((await files.rename(dir, "sketch.ino", "main.ino")).ok).toBe(false);
  });

  it("deletes to the trash, never the main file", async () => {
    const { dir, files, trashed } = project();
    await files.create(dir, "old.h");
    expect(await files.remove(dir, "old.h")).toEqual({ ok: true });
    expect(trashed).toEqual([join(dir, "sketch", "old.h")]);
    expect((await files.remove(dir, "sketch.ino")).ok).toBe(false);
  });
});

describe("links in the sketch folder (security audit)", () => {
  it("a link to a file elsewhere is neither listed nor opened", async () => {
    const { dir, files } = project();
    const secret = join(dir, "..", `secret-${Date.now()}.txt`);
    writeFileSync(secret, "PRIVATE");
    symlinkSync(secret, join(dir, "sketch", "notes.txt"));
    expect((await files.list(dir)).map((f) => f.name)).toEqual(["sketch.ino"]);
    expect(await files.read(dir, "notes.txt")).toMatchObject({ ok: false, message: expect.stringMatching(/links/) });
  });

  it("saving over a link replaces the link, never the file it points at", async () => {
    const { dir, files } = project();
    const target = join(dir, "..", `target-${Date.now()}.h`);
    writeFileSync(target, "original");
    symlinkSync(target, join(dir, "sketch", "motor.h"));
    expect((await files.write(dir, "motor.h", "// mine")).ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("original");
    expect(readFileSync(join(dir, "sketch", "motor.h"), "utf8")).toBe("// mine");
  });
});
