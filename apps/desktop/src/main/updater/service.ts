/**
 * Kiungo's own updates: look for a new version, download it in the
 * background, and install it when the person says Restart to update, or the
 * next time Kiungo quits. The work is electron-updater's (a generic feed of
 * <channel>.yml files, published by .github/workflows/release-desktop.yml);
 * this decides when to check, what the interface is told, and refuses to
 * restart while a real board is running or uploading.
 */
import type { UpdateInfo, UpdateInstallResult, UpdateState } from "@kiungo/api";

/** The part of electron-updater's AppUpdater this uses, so tests can stand in for it. */
export interface Updater {
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: "checking-for-update" | "update-not-available" | "update-available" | "update-downloaded", listener: (info: { version?: string }) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export type Support = { ok: true } | { ok: false; reason: "development" | "platform" | "disabled"; message: string };

/**
 * Whether this copy can update itself. Windows always can (the NSIS installer is
 * per-user, so no administrator). On Linux only the AppImage can, which the
 * APPIMAGE variable marks; macOS needs a signed app first (DSK-80).
 * KIUNGO_UPDATES=off turns it off, for computers a school manages.
 *
 * A development copy doesn't, unless KIUNGO_UPDATE_URL points it at a feed of
 * its own: that's how the flow is tried without publishing a release
 * (apps/desktop/README.md).
 */
export function updateSupport(input: { platform: NodeJS.Platform; packaged: boolean; env: Record<string, string | undefined> }): Support {
  if (/^(off|0|false|no)$/i.test(input.env.KIUNGO_UPDATES ?? "")) return { ok: false, reason: "disabled", message: "Updates are turned off on this computer." };
  if (!input.packaged) return input.env.KIUNGO_UPDATE_URL ? { ok: true } : { ok: false, reason: "development", message: "A development copy doesn't update itself." };
  if (input.platform === "win32") return { ok: true };
  if (input.platform === "linux") {
    return input.env.APPIMAGE ? { ok: true } : { ok: false, reason: "platform", message: "Kiungo was installed from a .deb or .rpm package. Download the new package from the website to update." };
  }
  if (input.platform === "darwin") return { ok: false, reason: "platform", message: "Kiungo can't update itself on macOS yet. Download the new version from the website." };
  return { ok: false, reason: "platform", message: "Kiungo can't update itself on this computer. Download the new version from the website." };
}

export interface UpdateServiceOptions {
  currentVersion: string;
  channel: string;
  support: Support;
  /** Where to get a new version by hand, for copies that can't update themselves. */
  downloadUrl: string;
  /** Made the first time it's needed, so a copy that can't update never loads electron-updater. */
  updater: () => Updater;
  /** Why installing must wait now ("A board is running."), or null when it can go ahead. */
  busy: () => string | null;
  /** Save every project and stop the board link, before the installer closes the app. */
  prepareToQuit: () => Promise<void>;
  onChange: (info: UpdateInfo) => void;
  now?: () => Date;
  /** After the app starts. */
  firstCheckAfterMs?: number;
  every?: number;
  log?: (message: string) => void;
}

const FIRST_CHECK_AFTER_MS = 15_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/** What a failed check says, in plain words. */
export function updateErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_CONNECTION|ERR_NETWORK|ERR_TIMED_OUT|net::/i.test(text)) {
    return "Couldn't reach the update server. Check the internet connection; Kiungo tries again later.";
  }
  if (/sha512 checksum mismatch|checksum/i.test(text)) return "The download didn't match the release, so it wasn't installed. Kiungo downloads it again next time.";
  if (/ENOSPC/i.test(text)) return "There isn't enough space on this computer to download the update.";
  return "The update couldn't be checked or downloaded. Kiungo tries again later.";
}

/** The feed has no file for this channel yet: nothing has been published, which isn't a fault. */
const isNothingPublished = (error: unknown) => /\b404\b|Cannot find channel/i.test(error instanceof Error ? error.message : String(error));

export class UpdateService {
  private state: UpdateState;
  private checkedAt: string | null = null;
  private wired: Updater | null = null;
  /** The check in flight, and whether the person asked for it. */
  private inFlight: { promise: Promise<UpdateInfo>; manual: boolean } | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private installing = false;
  /** Whether the person asked for the newest check, so its download's failure is shown too. */
  private manual = false;

  constructor(private readonly options: UpdateServiceOptions) {
    const { support } = options;
    this.state = support.ok ? { status: "idle", checkedAt: null } : { status: "unsupported", reason: support.reason, message: support.message, downloadUrl: options.downloadUrl };
  }

  info(): UpdateInfo {
    return { currentVersion: this.options.currentVersion, channel: this.options.channel, state: this.state };
  }

  /** Check a little after the app starts, then every few hours while it's open. */
  start(): void {
    if (!this.options.support.ok || this.timers.length) return;
    const first = setTimeout(() => void this.check(false), this.options.firstCheckAfterMs ?? FIRST_CHECK_AFTER_MS);
    const every = setInterval(() => void this.check(false), this.options.every ?? CHECK_EVERY_MS);
    for (const t of [first, every]) (t as { unref?: () => void }).unref?.();
    this.timers.push(first, every);
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** Look for a new version. `manual` when the person asked: then a failure is shown. */
  check(manual = true): Promise<UpdateInfo> {
    if (!this.options.support.ok) return Promise.resolve(this.info());
    // Already downloading or downloaded: nothing to look for until it's installed.
    if (this.state.status === "downloading" || this.state.status === "ready") return Promise.resolve(this.info());
    if (this.inFlight) {
      if (manual) this.inFlight.manual = this.manual = true;
      return this.inFlight.promise;
    }
    const flight = { manual, promise: Promise.resolve(this.info()) };
    flight.promise = this.run(flight).finally(() => {
      if (this.inFlight === flight) this.inFlight = null;
    });
    this.inFlight = flight;
    return flight.promise;
  }

  private async run(flight: { manual: boolean }): Promise<UpdateInfo> {
    this.manual = flight.manual;
    let updater: Updater;
    try {
      updater = this.updater();
    } catch (error) {
      this.options.log?.(`updater: couldn't start: ${String(error)}`);
      this.set({ status: "error", message: updateErrorMessage(error), quiet: !flight.manual, checkedAt: this.checkedAt });
      return this.info();
    }
    this.set({ status: "checking", checkedAt: this.checkedAt });
    try {
      await updater.checkForUpdates();
    } catch (error) {
      // The error event usually got here first; this covers a check that only threw.
      if (this.state.status === "checking") this.failed(error, flight.manual);
    }
    // The events have moved the state on (to up-to-date, downloading or error) by now;
    // a check that ended without one counts as up to date.
    if (this.state.status === "checking") this.set({ status: "up-to-date", checkedAt: this.stamp() });
    return this.info();
  }

  /** Restart into the downloaded version. */
  async install(): Promise<UpdateInstallResult> {
    if (this.state.status !== "ready") return { ok: false, message: "There's no update ready to install yet." };
    const busy = this.options.busy();
    if (busy) return { ok: false, message: busy };
    if (this.installing) return { ok: true };
    this.installing = true;
    try {
      await this.options.prepareToQuit();
      // Silent: the installer keeps the folder Kiungo is in and opens the new version when it's done.
      this.updater().quitAndInstall(true, true);
      return { ok: true };
    } catch (error) {
      this.installing = false;
      this.options.log?.(`updater: install failed: ${String(error)}`);
      return { ok: false, message: "Kiungo couldn't restart to update. Quit Kiungo and the update installs as it closes." };
    }
  }

  private updater(): Updater {
    if (this.wired) return this.wired;
    const updater = this.options.updater();
    updater.on("checking-for-update", () => this.set({ status: "checking", checkedAt: this.checkedAt }));
    updater.on("update-not-available", () => this.set({ status: "up-to-date", checkedAt: this.stamp() }));
    updater.on("update-available", (info) => this.set({ status: "downloading", version: info.version ?? "", percent: 0, checkedAt: this.stamp() }));
    updater.on("download-progress", (progress) => {
      if (this.state.status !== "downloading") return;
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      if (percent !== this.state.percent) this.set({ ...this.state, percent });
    });
    updater.on("update-downloaded", (info) => this.set({ status: "ready", version: info.version ?? "", checkedAt: this.stamp() }));
    updater.on("error", (error) => this.failed(error, this.inFlight?.manual ?? this.manual));
    this.wired = updater;
    return updater;
  }

  private failed(error: unknown, manual: boolean): void {
    // A downloaded update stays ready, whatever a later check says.
    if (this.state.status === "ready") return;
    this.options.log?.(`updater: ${error instanceof Error ? error.message : String(error)}`);
    if (isNothingPublished(error)) {
      this.set({ status: "up-to-date", checkedAt: this.stamp() });
      return;
    }
    this.set({ status: "error", message: updateErrorMessage(error), quiet: !manual, checkedAt: this.checkedAt });
  }

  private stamp(): string {
    this.checkedAt = (this.options.now?.() ?? new Date()).toISOString();
    return this.checkedAt;
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.options.onChange(this.info());
  }
}
