// @vitest-environment node
/** The Arduino CLI download rides out GitHub's occasional 5xx answers (a 504 failed CI on 5 Nov 2026). */
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script, no types.
import { download } from "../scripts/fetch-arduino-cli.mjs";

const answer = (status: number, body = "zip") => new Response(status === 200 ? body : null, { status });

function server(...answers: Array<number | Error>) {
  const calls: string[] = [];
  const get = async (url: string) => {
    calls.push(url);
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return answer(next ?? 200);
  };
  return { calls, get };
}
const quiet = { wait: async () => undefined, log: () => undefined };

describe("downloading the pinned Arduino CLI", () => {
  it("tries again after a gateway timeout or a dropped connection", async () => {
    const s = server(504, new Error("ECONNRESET"), 200);
    const bytes = await download("https://example.test/cli.zip", { ...quiet, get: s.get });
    expect(bytes.toString()).toBe("zip");
    expect(s.calls).toHaveLength(3);
  });

  it("waits longer each time", async () => {
    const waits: number[] = [];
    const s = server(503, 502, 200);
    await download("https://example.test/cli.zip", { get: s.get, log: () => undefined, wait: async (ms: number) => void waits.push(ms) });
    expect(waits).toEqual([2000, 4000]);
  });

  it("gives up after four tries, saying so", async () => {
    const s = server(504, 504, 504, 504, 200);
    await expect(download("https://example.test/cli.zip", { ...quiet, get: s.get })).rejects.toThrow(/504.*4 tries/);
    expect(s.calls).toHaveLength(4);
  });

  it("doesn't try again when the file isn't there", async () => {
    const s = server(404, 200);
    await expect(download("https://example.test/cli.zip", { ...quiet, get: s.get })).rejects.toThrow(/404/);
    expect(s.calls).toHaveLength(1);
  });
});
