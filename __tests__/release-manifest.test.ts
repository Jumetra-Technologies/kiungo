// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest, classify, latestChangelogSection } from "../.github/scripts/desktop-release-manifest.mjs";

describe("the release manifest the workflow writes", () => {
  it("classifies installers by name and takes the newest CHANGELOG section", () => {
    expect(classify("Kiungo-0.11.0-win-x64.exe")).toEqual({ platform: "windows", arch: "x64", kind: "nsis" });
    expect(classify("Kiungo-0.11.0-mac-arm64.dmg")).toEqual({ platform: "macos", arch: "arm64", kind: "dmg" });
    expect(classify("Kiungo-0.11.0-linux-amd64.deb")).toEqual({ platform: "linux", arch: "x64", kind: "deb" });
    expect(classify("latest-mac.yml")).toBeNull();
    expect(latestChangelogSection("# Changelog\n\nintro\n\n## [1.31.0] - 2026-11-02\n\nNew.\n\n## [1.30.0] - 2026-11-02\n\nOld.\n")).toBe("## [1.31.0] - 2026-11-02\n\nNew.");
  });

  it("writes every installer with its hash, size and GitHub download address", () => {
    const dist = mkdtempSync(join(tmpdir(), "kiungo-dist-"));
    writeFileSync(join(dist, "Kiungo-0.11.0-win-x64.exe"), "exe");
    writeFileSync(join(dist, "Kiungo-0.11.0-linux-x86_64.AppImage"), "app");
    writeFileSync(join(dist, "latest.yml"), "not an installer");
    const { manifest, notes } = buildManifest({ dist, repository: "Jumetra-Technologies/kiungo", tag: "desktop-v0.11.0", channel: "beta", version: "0.11.0", changelog: "## [1.31.0] - 2026-11-02\n\nNew things.\n", now: new Date("2026-11-02T12:00:00Z") });
    expect(manifest).toMatchObject({ channel: "beta", version: "0.11.0", published_at: "2026-11-02T12:00:00.000Z" });
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[1]).toMatchObject({ platform: "windows", arch: "x64", kind: "nsis", size: 3, url: "https://github.com/Jumetra-Technologies/kiungo/releases/download/desktop-v0.11.0/Kiungo-0.11.0-win-x64.exe" });
    expect(manifest.files[1].sha512).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(manifest.notes).toContain("New things.");
    expect(manifest.notes).toContain("aren't signed yet");
    expect(notes).toContain("| Kiungo-0.11.0-win-x64.exe |");
  });
});
