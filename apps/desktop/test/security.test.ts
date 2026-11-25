// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isSafeWebUrl, overridable } from "../src/main/security";

describe("addresses the main process trusts (security audit)", () => {
  it("https anywhere; http only to this computer", () => {
    for (const ok of ["https://kiungo.example/signin", "http://localhost:3000/x", "http://127.0.0.1:8000", "http://[::1]:8000/"]) expect(isSafeWebUrl(ok), ok).toBe(true);
    // A prefix check let these through.
    for (const bad of ["http://localhost.evil.example/", "http://127.0.0.1.evil.example/", "http://localhost@evil.example/", "http://evil.example/", "file:///etc/passwd", "javascript:alert(1)", "kiungo://signin", "not a url"]) {
      expect(isSafeWebUrl(bad), bad).toBe(false);
    }
  });

  it("an installed copy ignores a KIUNGO_* address that isn't https; a development copy takes it", () => {
    const fallback = "https://kiungo-api.onrender.com";
    const warned: string[] = [];
    expect(overridable("http://evil.example/api", fallback, true, (m) => warned.push(m))).toBe(fallback);
    expect(warned).toHaveLength(1);
    expect(overridable("https://staging.example/api/", fallback, true)).toBe("https://staging.example/api");
    expect(overridable("http://192.168.1.5:8000", fallback, false)).toBe("http://192.168.1.5:8000");
    expect(overridable(undefined, fallback, true)).toBe(fallback);
  });
});
