// @vitest-environment node
/**
 * In-app updates: when the app checks, what the interface is told, why a
 * restart waits, and the feed files the release workflow writes, read back
 * the way electron-updater reads them.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { UpdateInfo } from "@kiungo/api";
import { UpdateService, updateErrorMessage, updateSupport, type Support, type Updater } from "../src/main/updater/service";
// @ts-expect-error: a plain .mjs script, no types.
import { buildFeed, feedChannels } from "../../../.github/scripts/desktop-update-feed.mjs";
// electron-updater's own parsing, so the feed is checked the way installed copies read it.
import { parseUpdateInfo, resolveFiles } from "electron-updater/out/providers/Provider";
import { GenericProvider } from "electron-updater/out/providers/GenericProvider";

type Listener = (arg: never) => void;

/** Stands in for electron-updater: the test says what a check finds. */
function fakeUpdater() {
  const listeners = new Map<string, Listener[]>();
  const emit = (event: string, arg: unknown) => listeners.get(event)?.forEach((l) => (l as (a: unknown) => void)(arg));
  let next: () => Promise<void> = async () => emit("update-not-available", {});
  const updater = {
    checks: 0,
    installs: [] as Array<[boolean | undefined, boolean | undefined]>,
    emit,
    finds(behavior: () => Promise<void>) {
      next = behavior;
    },
    checkForUpdates: vi.fn(async () => {
      updater.checks++;
      emit("checking-for-update", {});
      await next();
    }),
    quitAndInstall(silent?: boolean, run?: boolean) {
      updater.installs.push([silent, run]);
    },
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return updater;
    },
  };
  return updater;
}

function service(opts: { support?: Support; busy?: () => string | null; prepare?: () => Promise<void> } = {}) {
  const updater = fakeUpdater();
  const seen: UpdateInfo[] = [];
  const made = vi.fn(() => updater as unknown as Updater);
  const prepare = vi.fn(opts.prepare ?? (async () => undefined));
  const s = new UpdateService({
    currentVersion: "0.11.0",
    channel: "beta",
    support: opts.support ?? { ok: true },
    downloadUrl: "https://example.test/#desktop",
    updater: made,
    busy: opts.busy ?? (() => null),
    prepareToQuit: prepare,
    onChange: (info) => seen.push(info),
    now: () => new Date("2026-11-04T08:00:00Z"),
  });
  return { s, updater, seen, made, prepare };
}

describe("which copies update themselves", () => {
  it("Windows and the AppImage do; development copies, macOS, .deb and .rpm don't", () => {
    expect(updateSupport({ platform: "win32", packaged: true, env: {} })).toEqual({ ok: true });
    expect(updateSupport({ platform: "linux", packaged: true, env: { APPIMAGE: "/home/a/Kiungo.AppImage" } })).toEqual({ ok: true });
    expect(updateSupport({ platform: "linux", packaged: true, env: {} })).toMatchObject({ ok: false, reason: "platform" });
    expect(updateSupport({ platform: "darwin", packaged: true, env: {} })).toMatchObject({ ok: false, reason: "platform" });
    expect(updateSupport({ platform: "win32", packaged: false, env: {} })).toMatchObject({ ok: false, reason: "development" });
    // A development copy pointed at a feed of its own can try the flow.
    expect(updateSupport({ platform: "linux", packaged: false, env: { KIUNGO_UPDATE_URL: "http://127.0.0.1:8777" } })).toEqual({ ok: true });
  });

  it("a school can turn updates off with KIUNGO_UPDATES=off", () => {
    expect(updateSupport({ platform: "win32", packaged: true, env: { KIUNGO_UPDATES: "off" } })).toMatchObject({ ok: false, reason: "disabled" });
    expect(updateSupport({ platform: "win32", packaged: true, env: { KIUNGO_UPDATES: "on" } })).toEqual({ ok: true });
  });

  it("a copy that can't update never loads electron-updater, and says where to get a new version", async () => {
    const { s, made } = service({ support: { ok: false, reason: "platform", message: "Download it." } });
    const info = await s.check();
    expect(made).not.toHaveBeenCalled();
    expect(info.state).toEqual({ status: "unsupported", reason: "platform", message: "Download it.", downloadUrl: "https://example.test/#desktop" });
  });
});

describe("checking and downloading", () => {
  it("nothing new: up to date, with when it checked", async () => {
    const { s, seen } = service();
    const info = await s.check();
    expect(info.state).toEqual({ status: "up-to-date", checkedAt: "2026-11-04T08:00:00.000Z" });
    expect(seen.map((i) => i.state.status)).toEqual(["checking", "checking", "up-to-date"]);
  });

  it("a new version downloads in the background, then is ready", async () => {
    const { s, updater } = service();
    updater.finds(async () => updater.emit("update-available", { version: "0.12.0" }));
    expect((await s.check()).state).toMatchObject({ status: "downloading", version: "0.12.0", percent: 0 });
    updater.emit("download-progress", { percent: 41.6 });
    expect(s.info().state).toMatchObject({ status: "downloading", percent: 42 });
    updater.emit("update-downloaded", { version: "0.12.0" });
    expect(s.info().state).toEqual({ status: "ready", version: "0.12.0", checkedAt: "2026-11-04T08:00:00.000Z" });
    // Nothing more to look for until it's installed.
    await s.check();
    expect(updater.checks).toBe(1);
  });

  it("two checks at once are one check", async () => {
    const { s, updater } = service();
    await Promise.all([s.check(false), s.check(true)]);
    expect(updater.checks).toBe(1);
  });

  it("a failed check nobody asked for is quiet; one the person asked for isn't", async () => {
    const { s, updater } = service();
    updater.finds(async () => {
      throw new Error("net::ERR_INTERNET_DISCONNECTED");
    });
    expect((await s.check(false)).state).toMatchObject({ status: "error", quiet: true });
    const asked = await s.check(true);
    expect(asked.state).toMatchObject({ status: "error", quiet: false, message: expect.stringContaining("internet connection") });
  });

  it("a download that fails after the person asked is shown", async () => {
    const { s, updater } = service();
    updater.finds(async () => updater.emit("update-available", { version: "0.12.0" }));
    await s.check(true);
    updater.emit("error", new Error("sha512 checksum mismatch, expected abc"));
    expect(s.info().state).toMatchObject({ status: "error", quiet: false, message: expect.stringContaining("didn't match") });
  });

  it("a feed with nothing published yet counts as up to date", async () => {
    const { s, updater } = service();
    updater.finds(async () => {
      throw new Error('Cannot find channel "beta.yml" update info: HttpError: 404');
    });
    expect((await s.check()).state.status).toBe("up-to-date");
  });

  it("a downloaded update stays ready, whatever a later error says", () => {
    const { s, updater } = service();
    void s.check();
    updater.emit("update-downloaded", { version: "0.12.0" });
    updater.emit("error", new Error("ECONNRESET"));
    expect(s.info().state.status).toBe("ready");
  });

  it("errors read plainly", () => {
    expect(updateErrorMessage(new Error("getaddrinfo ENOTFOUND github.com"))).toMatch(/internet connection/);
    expect(updateErrorMessage(new Error("ENOSPC: no space left on device"))).toMatch(/space/);
    expect(updateErrorMessage(new Error("something odd"))).toMatch(/tries again later/);
  });

  it("checks a little after starting, then every few hours, and stops", async () => {
    vi.useFakeTimers();
    try {
      const updater = fakeUpdater();
      const s = new UpdateService({ currentVersion: "0.11.0", channel: "beta", support: { ok: true }, downloadUrl: "", updater: () => updater as unknown as Updater, busy: () => null, prepareToQuit: async () => undefined, onChange: () => undefined, firstCheckAfterMs: 1000, every: 10_000 });
      s.start();
      s.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(updater.checks).toBe(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(updater.checks).toBe(2);
      s.stop();
      await vi.advanceTimersByTimeAsync(50_000);
      expect(updater.checks).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("restarting to update", () => {
  async function ready(opts: Parameters<typeof service>[0] = {}) {
    const made = service(opts);
    void made.s.check();
    made.updater.emit("update-downloaded", { version: "0.12.0" });
    return made;
  }

  it("saves everything first, then installs silently and opens the new version", async () => {
    const order: string[] = [];
    const { s, updater } = await ready({ prepare: async () => void order.push("saved") });
    const quit = updater.quitAndInstall.bind(updater);
    updater.quitAndInstall = (a, b) => (order.push("installed"), quit(a, b));
    expect(await s.install()).toEqual({ ok: true });
    expect(order).toEqual(["saved", "installed"]);
    expect(updater.installs).toEqual([[true, true]]);
  });

  it("waits while a board is running or uploading", async () => {
    let busy: string | null = "Stop the run on your board first, then restart to update.";
    const { s, updater, prepare } = await ready({ busy: () => busy });
    expect(await s.install()).toEqual({ ok: false, message: busy });
    expect(prepare).not.toHaveBeenCalled();
    expect(updater.installs).toEqual([]);
    busy = null;
    expect(await s.install()).toEqual({ ok: true });
    expect(updater.installs).toHaveLength(1);
  });

  it("there's nothing to install before a download is ready", async () => {
    const { s } = service();
    expect(await s.install()).toMatchObject({ ok: false });
  });

  it("a save that fails leaves the app open", async () => {
    const { s, updater } = await ready({ prepare: async () => Promise.reject(new Error("disk")) });
    expect(await s.install()).toMatchObject({ ok: false, message: expect.stringContaining("installs as it closes") });
    expect(updater.installs).toEqual([]);
  });
});

describe("the update feed the release writes", () => {
  const FEED = "https://github.com/Jumetra-Technologies/kiungo/releases/download/desktop-feed/";
  const RELEASE = "https://github.com/Jumetra-Technologies/kiungo/releases/download/desktop-v0.12.0/";
  /** What electron-builder writes beside the installers (as it did for the 0.11.0 AppImage). */
  const builderYaml = (file: string, extra = "") =>
    `version: 0.12.0\nfiles:\n  - url: ${file}\n    sha512: 61vuB9gSfRVqfhHZB+5db2X8T8wNRHY57PEmSEQVbmMN/pEY/0jSMeBFTdA8KpoCo6qQ8Mwu9LhMEq3eS4k/Ow==\n    size: 154135885\n${extra}path: ${file}\nsha512: 61vuB9gSfRVqfhHZB+5db2X8T8wNRHY57PEmSEQVbmMN/pEY/0jSMeBFTdA8KpoCo6qQ8Mwu9LhMEq3eS4k/Ow==\nreleaseDate: '2026-11-04T07:26:44.891Z'\n`;
  function dist(files: Record<string, string> = { "latest.yml": builderYaml("Kiungo-0.12.0-win-x64.exe"), "latest-linux.yml": builderYaml("Kiungo-0.12.0-linux-x86_64.AppImage", "    blockMapSize: 163169\n"), "latest-mac.yml": builderYaml("Kiungo-0.12.0-mac-arm64.zip") }) {
    const dir = mkdtempSync(join(tmpdir(), "kiungo-feed-"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  }
  const build = (channel: string, dir = dist()) => buildFeed({ dist: dir, repository: "Jumetra-Technologies/kiungo", tag: "desktop-v0.12.0", channel, version: "0.12.0" }) as Record<string, string>;

  it("a beta goes to beta only; a stable release to both, so beta copies get it too; macOS gets none yet", () => {
    expect(feedChannels("beta")).toEqual(["beta"]);
    expect(Object.keys(build("beta")).sort()).toEqual(["beta-linux.yml", "beta.yml"]);
    expect(Object.keys(build("stable")).sort()).toEqual(["beta-linux.yml", "beta.yml", "latest-linux.yml", "latest.yml"]);
  });

  it("keeps what electron-builder wrote, the AppImage's blockMapSize too", () => {
    const linux = build("beta")["beta-linux.yml"];
    expect(linux).toContain("blockMapSize: 163169");
    expect(linux).toMatch(new RegExp(`^path: '?${RELEASE.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}Kiungo-0\.12\.0-linux-x86_64\.AppImage'?$`, "m"));
  });

  it("keeps only the installer the app can update with: the .deb and .rpm beside the AppImage are left out", () => {
    // What electron-builder really writes for linux: [AppImage, deb, rpm], with path naming the first.
    const real = `version: 0.12.0\nfiles:\n  - url: Kiungo-0.12.0-linux-amd64.deb\n    sha512: debdeb\n    size: 135203216\n  - url: Kiungo-0.12.0-linux-x86_64.AppImage\n    sha512: appapp\n    size: 171417166\n    blockMapSize: 163169\n  - url: Kiungo-0.12.0-linux-x86_64.rpm\n    sha512: rpmrpm\n    size: 118101093\npath: Kiungo-0.12.0-linux-amd64.deb\nsha512: debdeb\nreleaseDate: '2026-11-04T08:53:00.000Z'\n`;
    const linux = build("beta", dist({ "latest.yml": builderYaml("Kiungo-0.12.0-win-x64.exe"), "latest-linux.yml": real }))["beta-linux.yml"];
    expect(linux).not.toContain(".deb");
    expect(linux).not.toContain(".rpm");
    expect(linux).toContain(`${RELEASE}Kiungo-0.12.0-linux-x86_64.AppImage`);
    expect(linux).toMatch(/^sha512: appapp$/m);
    expect(linux).toContain("blockMapSize: 163169");
    const info = parseUpdateInfo(linux, "beta-linux.yml", new URL(`${FEED}beta-linux.yml`));
    expect(info.files).toHaveLength(1);
    expect(info.path).toContain("AppImage");
  });

  it("refuses a file for another version, or one naming no installer at all", () => {
    expect(() => build("beta", dist({ "latest.yml": builderYaml("Kiungo-0.12.0-win-x64.exe").replace("version: 0.12.0", "version: 0.11.0") }))).toThrow(/0.11.0, not 0.12.0/);
    expect(() => build("beta", dist({ "latest.yml": builderYaml("../evil.exe") }))).toThrow(/names no installer/);
    expect(() => build("beta", dist({ "latest.yml": builderYaml("Kiungo-0.12.0-linux-x86_64.AppImage") }))).toThrow(/names no installer/);
  });

  it("electron-updater reads it, and downloads from the versioned release with its blockmaps", () => {
    const info = parseUpdateInfo(build("beta")["beta.yml"], "beta.yml", new URL(`${FEED}beta.yml`));
    expect(info.version).toBe("0.12.0");
    expect(info.files[0].size).toBe(154135885);
    const [file] = resolveFiles(info, new URL(FEED));
    expect(file.url.href).toBe(`${RELEASE}Kiungo-0.12.0-win-x64.exe`);
    const provider = new GenericProvider({ provider: "generic", url: FEED }, { channel: "beta", isAddNoCacheQuery: false } as never, { platform: "win32", executor: null } as never);
    const [old, next] = provider.getBlockMapFiles(file.url, "0.11.0", "0.12.0") as URL[];
    expect(next.href).toBe(`${RELEASE}Kiungo-0.12.0-win-x64.exe.blockmap`);
    expect(old.href).toBe("https://github.com/Jumetra-Technologies/kiungo/releases/download/desktop-v0.11.0/Kiungo-0.11.0-win-x64.exe.blockmap");
  });

  it("beta copies read beta.yml on Windows and beta-linux.yml on Linux", () => {
    const linux = new GenericProvider({ provider: "generic", url: FEED, channel: "beta" }, { channel: null } as never, { platform: "linux", executor: null } as never);
    expect((linux as unknown as { channel: string }).channel).toBe(process.arch === "x64" ? "beta-linux" : `beta-linux-${process.arch}`);
    const win = new GenericProvider({ provider: "generic", url: FEED, channel: "beta" }, { channel: null } as never, { platform: "win32", executor: null } as never);
    expect((win as unknown as { channel: string }).channel).toBe("beta");
  });
});
