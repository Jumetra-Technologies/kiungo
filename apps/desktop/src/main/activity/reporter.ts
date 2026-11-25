/**
 * Tells Kiungo's server the desktop app is in use, for the admin portal:
 * every minute while its window is shown and the computer has had input in
 * the last five minutes, with the desktop session's token. The server credits
 * the time between heartbeats (at most 75 seconds each) to the account and
 * keeps only daily totals (jumetra-backend docs/admin-portal.md).
 *
 * It sends which screen is open (Home or a project), never what's in it.
 * Only when the account said yes to usage counting (asked by the website's
 * banner, or Settings, Privacy; GET /auth/me/consents, checked every
 * CONSENT_MS). Signed out, not asked, a no, or offline: it sends nothing and
 * nothing is queued.
 */

export type DesktopPage = "/desktop/home" | "/desktop/project";

export interface ReporterWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
}

export interface ActivityReporterOptions {
  apiBase: string;
  token: () => Promise<string | null>;
  window: () => ReporterWindow | null;
  /** Seconds since the last keyboard or mouse input on the computer (Electron's powerMonitor). */
  idleSeconds: () => number;
  page: () => DesktopPage;
  appVersion: string;
  fetch?: typeof fetch;
  intervalMs?: number;
}

export const BEAT_MS = 60_000;
export const CONSENT_MS = 10 * 60_000;
export const IDLE_SECONDS = 300;

export class ActivityReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPage: DesktopPage | null = null;
  private active = false;
  private readonly fetchImpl: typeof fetch;
  private consent: { allowed: boolean; at: number; token: string } | null = null;

  constructor(private readonly opts: ActivityReporterOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs ?? BEAT_MS);
    void this.tick();
  }

  /** Stops, and tells the server the app has gone, so it shows offline at once. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.active) await this.send("leave", this.lastPage ?? this.opts.page());
    this.active = false;
  }

  private inUse(): boolean {
    const win = this.opts.window();
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return false;
    return this.opts.idleSeconds() < IDLE_SECONDS;
  }

  /** One check: a view when the screen changed, a beat while in use, a leave when it stops being used. */
  async tick(): Promise<void> {
    const page = this.opts.page();
    if (!this.inUse()) {
      if (this.active) await this.send("leave", this.lastPage ?? page);
      this.active = false;
      return;
    }
    const event = page !== this.lastPage || !this.active ? "view" : "beat";
    if (await this.send(event, page)) {
      this.active = true;
      this.lastPage = page;
    }
  }

  /** Whether the account said yes, asked of the server at most every CONSENT_MS (and again after a sign-in change). */
  private async allowed(token: string): Promise<boolean> {
    const now = Date.now();
    if (this.consent && this.consent.token === token && now - this.consent.at < CONSENT_MS) return this.consent.allowed;
    try {
      const res = await this.fetchImpl(`${this.opts.apiBase.replace(/\/+$/, "")}/auth/me/consents`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      const body = res.ok ? ((await res.json()) as { usage?: boolean | null }) : null;
      this.consent = { allowed: body?.usage === true, at: now, token };
    } catch {
      return this.consent?.token === token ? this.consent.allowed : false; // offline: keep the last answer, or send nothing
    }
    return this.consent.allowed;
  }

  private async send(event: "view" | "beat" | "leave", page: DesktopPage): Promise<boolean> {
    const token = await this.opts.token().catch(() => null);
    if (!token) return false;
    if (!(await this.allowed(token))) return false;
    try {
      const res = await this.fetchImpl(`${this.opts.apiBase.replace(/\/+$/, "")}/telemetry/heartbeat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client: "desktop", page, event, app_version: this.opts.appVersion }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch {
      return false; // offline: nothing to do; the next beat starts a new visit
    }
  }
}
