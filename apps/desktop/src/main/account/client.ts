/**
 * Calls to the person's website account from the main process (import,
 * sync), with the desktop session's bearer token. The renderer never sees
 * the token.
 */

export class AccountProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface AccountClientOptions {
  apiBase: string;
  token: () => Promise<string | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class AccountClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: AccountClientOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** A request on the account. Throws AccountProblem: 0 offline, 401 signed out, else the server's answer. */
  async request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: boolean } = {}): Promise<{ status: number; headers: Headers; data: unknown }> {
    const token = await this.opts.token();
    if (!token) throw new AccountProblem(401, "Sign in to use your Kiungo account.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.apiBase.replace(/\/+$/, "")}${path}`, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch {
      throw new AccountProblem(0, "Kiungo's servers can't be reached. Check the internet connection.");
    } finally {
      clearTimeout(timer);
    }
    const data = init.raw && res.ok ? new Uint8Array(await res.arrayBuffer()) : await res.json().catch(() => null);
    if (!res.ok && res.status !== 409 && res.status !== 422) {
      const detail = (data as { detail?: unknown } | null)?.detail;
      throw new AccountProblem(res.status, typeof detail === "string" ? detail : `Kiungo's servers answered ${res.status}.`);
    }
    return { status: res.status, headers: res.headers, data };
  }

  async get<T>(path: string): Promise<T> {
    return (await this.request(path)).data as T;
  }
}
