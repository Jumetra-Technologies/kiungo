import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const app = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")) as { version: string };
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as { packages: Record<string, { version?: string }> };
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");

describe("the desktop app's version", () => {
  it("is a semantic version, and package-lock.json agrees", () => {
    expect(app.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    expect(lock.packages["apps/desktop"].version).toBe(app.version);
  });

  it("has the newest CHANGELOG section, with its link: the release notes come from it", () => {
    const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+[^\]]*)\]/gm)].map((m) => m[1]);
    expect(versions[0]).toBe(app.version);
    expect(changelog).toMatch(new RegExp(`^\\[${app.version.replace(/\./g, "\\.")}\\]: `, "m"));
  });
});
