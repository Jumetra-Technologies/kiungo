// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthState } from "@kiungo/api";
import { AuthService, parseSignInLink, pkcePair, type SecretStore } from "../src/main/auth/service";

/** A backend with the desktop sign-in routes, in memory (jumetra-backend docs/desktop-sign-in.md). */
function fakeBackend() {
  const codes = new Map<string, { challenge: string; status: string; code?: string; collected?: boolean }>();
  const refresh = new Map<string, { device: string; revoked: boolean }>();
  const revokedDevices = new Set<string>();
  let n = 0;
  let online = true;
  let desktopRoutes = true;
  const calls: string[] = [];
  const tokens = (device: string) => {
    const r = `refresh-${++n}`;
    refresh.set(r, { device, revoked: false });
    return { access_token: `access-${n}`, refresh_token: r, expires_in: 900, device: { name: "Brad's ThinkPad" }, user: { id: "u1", email: "brad@example.test", display_name: "Brad", photo_url: null } };
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!online) throw new TypeError("fetch failed");
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (!desktopRoutes && path.startsWith("/auth/desktop")) return json(404, { detail: "Not Found" });
    if (path === "/auth/desktop/codes" && init?.method === "POST") {
      const id = `code-${++n}`;
      codes.set(id, { challenge: body.code_challenge, status: "pending" });
      return json(201, { code_id: id, authorize_url: `https://kiungo.test/desktop/sign-in?code_id=${id}`, expires_in: 600, poll_interval: 3 });
    }
    const status = /^\/auth\/desktop\/codes\/([^/]+)$/.exec(path);
    if (status) {
      const row = codes.get(status[1])!;
      const answer: Record<string, unknown> = { status: row.status };
      if (row.status === "approved" && !row.collected) {
        answer.code = row.code;
        row.collected = true;
      }
      return json(200, answer);
    }
    if (path === "/auth/desktop/token") {
      const row = [...codes.values()].find((c) => c.code === body.code);
      if (!row || row.status !== "approved") return json(400, { detail: "That sign-in code was already used or has expired. Start the sign-in again from the app." });
      const digest = createHash("sha256").update(body.code_verifier).digest("base64url");
      if (digest !== row.challenge) {
        row.status = "denied";
        return json(400, { detail: "That sign-in code doesn't belong to this app. Start the sign-in again." });
      }
      row.status = "exchanged";
      return json(200, tokens(`device-${n}`));
    }
    if (path === "/auth/desktop/refresh") {
      const row = refresh.get(body.refresh_token);
      if (!row || revokedDevices.has(row.device)) return json(401, { detail: "Sign in again." });
      if (row.revoked) {
        revokedDevices.add(row.device);
        return json(401, { detail: "This sign-in was used somewhere else, so it has been ended. Sign in again." });
      }
      row.revoked = true;
      return json(200, tokens(row.device));
    }
    if (path === "/auth/desktop/logout") {
      const row = refresh.get(body.refresh_token);
      if (row) revokedDevices.add(row.device);
      return json(200, { status: "ok" });
    }
    return json(404, { detail: "Not Found" });
  }) as typeof fetch;
  return {
    fetch: fetchImpl,
    calls,
    /** The website: the person signs in and approves the code. */
    approve(codeId: string) {
      const row = codes.get(codeId)!;
      row.status = "approved";
      row.code = `secret-${codeId}`;
      return `kiungo://signin?code=${row.code}&code_id=${codeId}`;
    },
    deny(codeId: string) {
      codes.get(codeId)!.status = "denied";
    },
    setOnline(v: boolean) {
      online = v;
    },
    setDesktopRoutes(v: boolean) {
      desktopRoutes = v;
    },
    revoked: revokedDevices,
  };
}

function memoryStore(secure = true): SecretStore & { value: string | null } {
  const store = {
    value: null as string | null,
    secure: () => secure,
    read: async () => store.value,
    write: async (v: string) => {
      store.value = v;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

function service(backend = fakeBackend(), store = memoryStore()) {
  const opened: string[] = [];
  const states: AuthState[] = [];
  const auth = new AuthService({
    apiBase: "https://api.kiungo.test/api",
    device: { name: "Brad's ThinkPad", platform: "linux", appVersion: "0.4.0" },
    store,
    openBrowser: async (url) => {
      opened.push(url);
    },
    fetch: backend.fetch,
    onChange: (s) => states.push(s),
    pollSeconds: 0.01,
  });
  return { auth, backend, store, opened, states };
}

const codeIdOf = (url: string) => new URL(url).searchParams.get("code_id")!;
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("PKCE and the kiungo:// link", () => {
  it("makes a verifier the backend accepts (43 to 128 characters) and its S256 challenge", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("reads kiungo://signin links and nothing else", () => {
    expect(parseSignInLink("kiungo://signin?code=abc&code_id=c1")).toEqual({ code: "abc", codeId: "c1" });
    expect(parseSignInLink("kiungo://signin/?code=abc&code_id=c1")).toEqual({ code: "abc", codeId: "c1" });
    expect(parseSignInLink("kiungo://other?code=abc&code_id=c1")).toBeNull();
    expect(parseSignInLink("https://evil.test/signin?code=abc&code_id=c1")).toBeNull();
    expect(parseSignInLink("kiungo://signin?code=abc")).toBeNull();
    expect(parseSignInLink("not a url")).toBeNull();
  });
});

describe("signing in (DSK-01, DSK-02)", () => {
  it("opens the website, comes back through kiungo://, and keeps the session encrypted", async () => {
    const { auth, backend, store, opened } = service();
    expect((await auth.restore()).status).toBe("signed-out");
    const waiting = await auth.signIn();
    expect(waiting).toMatchObject({ status: "waiting", signInUrl: opened[0] });
    expect(opened[0]).toMatch(/^https:\/\/kiungo\.test\/desktop\/sign-in\?code_id=/);

    const link = backend.approve(codeIdOf(opened[0]));
    const state = await auth.handleLink(link);
    expect(state).toMatchObject({ status: "signed-in", user: { name: "Brad", email: "brad@example.test" }, offline: false, secureStorage: true });
    expect(JSON.parse(store.value!)).toMatchObject({ refreshToken: expect.stringMatching(/^refresh-/), user: { id: "u1" } });
    expect(await auth.token()).toMatch(/^access-/);
  });

  it("finds the approval by polling when the kiungo:// link never arrives (some Linux desktops)", async () => {
    const { auth, backend, opened } = service();
    await auth.signIn();
    backend.approve(codeIdOf(opened[0]));
    await settle();
    expect(auth.current()).toMatchObject({ status: "signed-in" });
  });

  it("ignores a link for another sign-in attempt, and a forged code can't be used without the verifier", async () => {
    const { auth, backend, opened } = service();
    await auth.signIn();
    expect((await auth.handleLink("kiungo://signin?code=x&code_id=someone-else")).status).toBe("waiting");
    // Another app (no verifier) racing to the token endpoint with the real code gets nothing.
    const link = backend.approve(codeIdOf(opened[0]));
    const res = await backend.fetch("https://api.kiungo.test/api/auth/desktop/token", { method: "POST", body: JSON.stringify({ code: new URL(link).searchParams.get("code"), code_verifier: "x".repeat(43) }) });
    expect(res.status).toBe(400);
    // The code is burnt, so the real app is told to start again rather than signed in to someone else's session.
    expect(await auth.handleLink(link)).toMatchObject({ status: "signed-out", message: expect.stringMatching(/Start the sign-in again/) });
  });

  it("says so when the person turns the sign-in down on the website", async () => {
    const { auth, backend, opened } = service();
    await auth.signIn();
    backend.deny(codeIdOf(opened[0]));
    await settle();
    expect(auth.current()).toMatchObject({ status: "signed-out", message: "The sign-in was turned down on the website." });
  });

  it("offers to go on without signing in when sign-in can't start: offline, or the service isn't there", async () => {
    const backend = fakeBackend();
    const { auth } = service(backend);
    backend.setOnline(false);
    expect(await auth.signIn()).toMatchObject({ status: "signed-out", canSkip: true, message: expect.stringMatching(/can't reach/) });
    expect(auth.skip()).toMatchObject({ skipped: true });

    backend.setOnline(true);
    backend.setDesktopRoutes(false);
    expect(await auth.signIn()).toMatchObject({ status: "signed-out", canSkip: true, message: expect.stringMatching(/isn't switched on/) });
  });

  it("can't skip signing in when it works", async () => {
    const { auth } = service();
    await auth.restore();
    expect(auth.skip()).toMatchObject({ status: "signed-out", skipped: false });
  });
});

describe("staying signed in (DSK-02)", () => {
  it("survives a restart, refreshing (and rotating) the session", async () => {
    const backend = fakeBackend();
    const store = memoryStore();
    const first = service(backend, store);
    await first.auth.signIn();
    await first.auth.handleLink(backend.approve(codeIdOf(first.opened[0])));
    const before = JSON.parse(store.value!).refreshToken;

    const second = service(backend, store);
    expect(await second.auth.restore()).toMatchObject({ status: "signed-in", offline: false });
    expect(JSON.parse(store.value!).refreshToken).not.toBe(before);
  });

  it("stays signed in while offline, and checks again when it can", async () => {
    const backend = fakeBackend();
    const store = memoryStore();
    const first = service(backend, store);
    await first.auth.signIn();
    await first.auth.handleLink(backend.approve(codeIdOf(first.opened[0])));

    backend.setOnline(false);
    const second = service(backend, store);
    expect(await second.auth.restore()).toMatchObject({ status: "signed-in", offline: true });
    backend.setOnline(true);
    expect(await second.auth.refresh()).toMatchObject({ status: "signed-in", offline: false });
  });

  it("signs out when the session was ended elsewhere (the device removed on the website)", async () => {
    const backend = fakeBackend();
    const store = memoryStore();
    const first = service(backend, store);
    await first.auth.signIn();
    await first.auth.handleLink(backend.approve(codeIdOf(first.opened[0])));
    // The person removes this computer on the website: its sessions end.
    await backend.fetch("https://api.kiungo.test/api/auth/desktop/logout", { method: "POST", body: JSON.stringify({ refresh_token: JSON.parse(store.value!).refreshToken }) });
    const second = service(backend, store);
    expect(await second.auth.restore()).toMatchObject({ status: "signed-out", message: "Sign in again." });
    expect(store.value).toBeNull();
  });

  it("without a keychain, keeps the session in memory only and says so", async () => {
    const backend = fakeBackend();
    const store = memoryStore(false);
    const { auth, opened } = service(backend, store);
    await auth.signIn();
    expect(await auth.handleLink(backend.approve(codeIdOf(opened[0])))).toMatchObject({ status: "signed-in", secureStorage: false });
    expect(store.value).toBeNull();
  });
});

describe("signing out (DSK-03)", () => {
  it("revokes the device and forgets the session, even offline", async () => {
    const backend = fakeBackend();
    const { auth, store, opened } = service(backend);
    await auth.signIn();
    await auth.handleLink(backend.approve(codeIdOf(opened[0])));
    expect(await auth.signOut()).toMatchObject({ status: "signed-out" });
    expect(store.value).toBeNull();
    expect(backend.calls).toContain("POST /auth/desktop/logout");
    expect(backend.revoked.size).toBe(1);

    // Offline: nothing to tell the backend, but this computer forgets the session all the same.
    await auth.signIn();
    await auth.handleLink(backend.approve(codeIdOf(opened[1])));
    backend.setOnline(false);
    expect(await auth.signOut()).toMatchObject({ status: "signed-out" });
    expect(store.value).toBeNull();
  });

  it("tells the interface each change", async () => {
    const onChange = vi.fn();
    const backend = fakeBackend();
    const auth = new AuthService({ apiBase: "https://api.kiungo.test/api", device: { name: "PC", platform: "windows", appVersion: "0.4.0" }, store: memoryStore(), openBrowser: async () => undefined, fetch: backend.fetch, onChange, pollSeconds: 60 });
    await auth.signIn();
    auth.cancel();
    expect(onChange.mock.calls.map(([s]) => s.status)).toEqual(["waiting", "signed-out"]);
  });
});
