// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STARTERS } from "@kiungo/core/project";
import { BUILT_IN_LIBRARIES, LibraryTrust } from "../src/main/build/library-trust";

const lib = (name: string) => ({ name, version: "1.0.0", dependency: false });

describe("libraries this computer builds with (security audit)", () => {
  it("everything Kiungo's own starters use is trusted, so a new project never asks", async () => {
    const trust = new LibraryTrust(join(mkdtempSync(join(tmpdir(), "kiungo-trust-")), "trusted.json"));
    const starterLibraries = STARTERS.flatMap((s) => s.libraries);
    expect(starterLibraries.length).toBeGreaterThan(0);
    expect(await trust.unknown(starterLibraries.map((l) => ({ ...l, dependency: Boolean(l.dependency) })))).toEqual([]);
    expect(BUILT_IN_LIBRARIES).toContain("Servo");
  });

  it("names the others once each, case-insensitively, and remembers approvals on disk", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "kiungo-trust-")), "trusted.json");
    const trust = new LibraryTrust(file);
    expect((await trust.unknown([lib("Evil Lib"), lib("evil lib"), lib("servo")])).map((l) => l.name)).toEqual(["Evil Lib"]);
    await trust.trust(["Evil Lib"]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["evil lib"]);
    expect(await new LibraryTrust(file).unknown([lib("EVIL LIB")])).toEqual([]);
  });

  it("an unreadable file means only the built-in list", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "kiungo-trust-")), "trusted.json");
    writeFileSync(file, "{not json");
    expect(await new LibraryTrust(file).unknown([lib("Evil Lib")])).toHaveLength(1);
  });
});
