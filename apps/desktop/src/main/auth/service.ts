/**
 * Signing in to the desktop app (DSK-01 to DSK-03), against the backend's
 * desktop sign-in routes (jumetra-backend docs/desktop-sign-in.md).
 *
 *   1. POST /auth/desktop/codes with a PKCE challenge; open the website's
 *      sign-in page in the browser.
 *   2. The person signs in there and approves this computer. The browser
 *      sends the app back to kiungo://signin?code=…&code_id=…; if that never
 *      arrives (some Linux desktops), polling the code's status finds it.
 *   3. POST /auth/desktop/token with the code and the verifier kept here.
 *   4. The refresh token is kept, encrypted by the operating system's
 *      keychain; it is refreshed on start, which also rotates it.
 *
 * Plain Node, no Electron: the main process supplies the network, the
 * keychain, the browser and the clock, so tests run it against a fake backend.
 */

import { createHash, randomBytes } from "node:crypto";
import type { AccountUser, AuthState } from "@kiungo/api";

export interface SecretStore {
  /** False when the computer has no keychain to encrypt with (some Linux setups). */
  secure: () => boolean;
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  clear: () => Promise<void>;
}

export interface AuthServiceOptions {
  /** The backend, e.g. https://…/api. */
  apiBase: string;
  device: { name: string; platform: "windows" | "linux" | "macos"; appVersion: string };
  store: SecretStore;
  openBrowser: (url: string) => Promise<void>;
  fetch?: typeof fetch;
  /** Told whenever the state changes, to pass to the interface. */
  onChange?: (state: AuthState) => void;
  now?: () => number;
  /** Seconds between status checks while the browser is open; the backend suggests one. */
  pollSeconds?: number;
  requestTimeoutMs?: number;
}

interface StoredSession {
  version: 1;
  refreshToken: string;
  user: AccountUser;
  deviceName: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  device: { name: string };
  user: { id: string; email: string; name?: string; display_name?: string; photo_url?: string | null; picture_url?: string | null };
}

class ApiProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

function toUser(raw: TokenResponse["user"]): AccountUser {
  return { id: raw.id, email: raw.email, name: raw.display_name || raw.name || raw.email, photoUrl: raw.photo_url ?? raw.picture_url ?? null };
}

/** Pull `code` and `code_id` out of kiungo://signin?code=…&code_id=…; null for anything else. */
export function parseSignInLink(link: string): { code: string; codeId: string } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "kiungo:") return null;
  // kiungo://signin parses with "signin" as the host.
  const target = (url.host || url.pathname.replace(/^\/+/, "")).toLowerCase();
  if (target !== "signin") return null;
  const code = url.searchParams.get("code");
  const codeId = url.searchParams.get("code_id");
  if (!code || !codeId || code.length > 128 || codeId.length > 128) return null;
  return { code, codeId };
}

export class AuthService {
  private state: AuthState = { status: "signed-out", message: null, canSkip: false, skipped: false };
  private session: StoredSession | null = null;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private pending: { codeId: string; verifier: string; expiresAt: number } | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private exchanging = false;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opts: AuthServiceOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  current(): AuthState {
    return this.state;
  }

  private set(next: AuthState): AuthState {
    this.state = next;
    this.opts.onChange?.(next);
    return next;
  }

  private signedIn(offline: boolean): AuthState {
    const s = this.session!;
    return this.set({ status: "signed-in", user: s.user, deviceName: s.deviceName, offline, secureStorage: this.opts.store.secure() });
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs ?? 15_000);
    try {
      const res = await this.fetchImpl(`${this.opts.apiBase.replace(/\/+$/, "")}${path}`, {
        method: init.method ?? "GET",
        headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null;
        throw new ApiProblem(res.status, typeof payload?.detail === "string" ? payload.detail : `The sign-in service answered ${res.status}.`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** On start: read the kept session and check it, offline-tolerant. */
  async restore(): Promise<AuthState> {
    let raw: string | null = null;
    try {
      raw = await this.opts.store.read();
    } catch {
      raw = null;
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredSession;
        if (parsed?.version === 1 && typeof parsed.refreshToken === "string" && parsed.user?.id) this.session = parsed;
      } catch {
        /* unreadable: treated as signed out */
      }
    }
    if (!this.session) return this.set({ status: "signed-out", message: null, canSkip: false, skipped: false });
    this.signedIn(true);
    await this.refresh();
    return this.state;
  }

  /** Refresh (and rotate) the session. Offline keeps you signed in; a refusal signs you out. */
  async refresh(): Promise<AuthState> {
    if (!this.session) return this.state;
    try {
      const tokens = await this.call<TokenResponse>("/auth/desktop/refresh", { method: "POST", body: { refresh_token: this.session.refreshToken } });
      await this.keep(tokens);
      return this.signedIn(false);
    } catch (error) {
      if (error instanceof ApiProblem && (error.status === 401 || error.status === 403)) {
        await this.forget();
        return this.set({ status: "signed-out", message: error.message || "Sign in again.", canSkip: false, skipped: false });
      }
      // Offline, or the service is down: the session stands until it can be checked.
      return this.signedIn(true);
    }
  }

  /** A current access token for calling the backend, refreshing first when it has run out. */
  async token(): Promise<string | null> {
    if (!this.session) return null;
    if (this.accessToken && this.accessToken.expiresAt - 30_000 > this.now()) return this.accessToken.value;
    await this.refresh();
    return this.accessToken?.value ?? null;
  }

  private async keep(tokens: TokenResponse): Promise<void> {
    this.session = { version: 1, refreshToken: tokens.refresh_token, user: toUser(tokens.user), deviceName: tokens.device?.name ?? this.opts.device.name };
    this.accessToken = { value: tokens.access_token, expiresAt: this.now() + tokens.expires_in * 1000 };
    // Without a keychain the refresh token stays in memory only: you sign in again next time.
    if (this.opts.store.secure()) await this.opts.store.write(JSON.stringify(this.session));
    else await this.opts.store.clear().catch(() => undefined);
  }

  private async forget(): Promise<void> {
    this.session = null;
    this.accessToken = null;
    await this.opts.store.clear().catch(() => undefined);
  }

  /** Step 1: start a sign-in and open the browser. */
  async signIn(): Promise<AuthState> {
    this.stopPolling();
    const { verifier, challenge } = pkcePair();
    let started: { code_id: string; authorize_url: string; expires_in: number; poll_interval?: number };
    try {
      started = await this.call("/auth/desktop/codes", {
        method: "POST",
        body: { code_challenge: challenge, code_challenge_method: "S256", device: { name: this.opts.device.name, platform: this.opts.device.platform, app_version: this.opts.device.appVersion }, redirect_uri: "kiungo://signin" },
      });
    } catch (error) {
      if (error instanceof ApiProblem && (error.status === 404 || error.status === 405)) {
        return this.set({ status: "signed-out", message: "Signing in from the desktop app isn't switched on for Kiungo yet. You can use Kiungo without signing in for now.", canSkip: true, skipped: false });
      }
      if (error instanceof ApiProblem) return this.set({ status: "signed-out", message: error.message, canSkip: true, skipped: false });
      return this.set({ status: "signed-out", message: "Kiungo can't reach the sign-in service. Check your internet connection and try again.", canSkip: true, skipped: false });
    }
    const expiresAt = this.now() + started.expires_in * 1000;
    this.pending = { codeId: started.code_id, verifier, expiresAt };
    try {
      await this.opts.openBrowser(started.authorize_url);
    } catch {
      /* the page address is shown so it can be opened by hand */
    }
    this.schedulePoll(this.opts.pollSeconds ?? started.poll_interval ?? 3);
    return this.set({ status: "waiting", startedAt: new Date(this.now()).toISOString(), expiresAt: new Date(expiresAt).toISOString(), signInUrl: started.authorize_url });
  }

  cancel(): AuthState {
    this.stopPolling();
    this.pending = null;
    return this.set({ status: "signed-out", message: null, canSkip: false, skipped: false });
  }

  /** Step 2a: the browser sent the app back with a code. Links for other attempts are ignored. */
  async handleLink(link: string): Promise<AuthState> {
    const parsed = parseSignInLink(link);
    if (!parsed || !this.pending || parsed.codeId !== this.pending.codeId) return this.state;
    return this.exchange(parsed.code);
  }

  private schedulePoll(seconds: number): void {
    this.stopPolling();
    this.pollTimer = setTimeout(() => void this.poll(seconds), seconds * 1000);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** Step 2b: ask the backend whether the code was approved. */
  private async poll(seconds: number): Promise<void> {
    const pending = this.pending;
    if (!pending || this.exchanging) return;
    if (this.now() > pending.expiresAt) {
      this.pending = null;
      this.set({ status: "signed-out", message: "The sign-in took too long. Try again.", canSkip: false, skipped: false });
      return;
    }
    try {
      const status = await this.call<{ status: string; code?: string }>(`/auth/desktop/codes/${encodeURIComponent(pending.codeId)}`);
      if (this.pending !== pending) return;
      if (status.status === "approved" && status.code) {
        await this.exchange(status.code);
        return;
      }
      if (status.status === "denied") {
        this.pending = null;
        this.set({ status: "signed-out", message: "The sign-in was turned down on the website.", canSkip: false, skipped: false });
        return;
      }
      if (status.status === "expired") {
        this.pending = null;
        this.set({ status: "signed-out", message: "The sign-in took too long. Try again.", canSkip: false, skipped: false });
        return;
      }
      // "approved" without a code: the browser has it and is sending it through kiungo://. Keep waiting.
    } catch {
      /* a dropped connection: try again at the next tick */
    }
    if (this.pending === pending) this.schedulePoll(seconds);
  }

  /** Step 3: trade the code and the verifier for a session. */
  private async exchange(code: string): Promise<AuthState> {
    const pending = this.pending;
    if (!pending || this.exchanging) return this.state;
    this.exchanging = true;
    this.stopPolling();
    try {
      const tokens = await this.call<TokenResponse>("/auth/desktop/token", { method: "POST", body: { code, code_verifier: pending.verifier } });
      this.pending = null;
      await this.keep(tokens);
      return this.signedIn(false);
    } catch (error) {
      this.pending = null;
      return this.set({ status: "signed-out", message: error instanceof ApiProblem ? error.message : "Kiungo couldn't finish signing in. Check your connection and try again.", canSkip: !(error instanceof ApiProblem), skipped: false });
    } finally {
      this.exchanging = false;
    }
  }

  /** End this computer's session (the backend revokes the device). Projects on disk are untouched. */
  async signOut(): Promise<AuthState> {
    this.stopPolling();
    this.pending = null;
    const refreshToken = this.session?.refreshToken;
    await this.forget();
    if (refreshToken) {
      // Best effort: offline, the token is still gone from this computer.
      await this.call("/auth/desktop/logout", { method: "POST", body: { refresh_token: refreshToken } }).catch(() => undefined);
    }
    return this.set({ status: "signed-out", message: null, canSkip: false, skipped: false });
  }

  /** Go on without signing in. Only allowed when signing in couldn't start. */
  skip(): AuthState {
    if (this.state.status !== "signed-out" || !this.state.canSkip) return this.state;
    return this.set({ ...this.state, skipped: true });
  }

  dispose(): void {
    this.stopPolling();
  }
}
