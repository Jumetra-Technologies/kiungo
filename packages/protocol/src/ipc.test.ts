import { describe, expect, it } from "vitest";
import { IPC } from "./ipc";

describe("IPC channels", () => {
  it("uses a unique, namespaced name for every channel", () => {
    const names = Object.values(IPC);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+:[a-z-]+$/);
  });
});
