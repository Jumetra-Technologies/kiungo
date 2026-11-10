import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FromWorker, ToWorker } from "./protocol";

const hex = readFileSync(join(__dirname, "../../test/fixtures/blink-uno.hex"), "utf8");

/** The worker's global scope, as a page sees it: messages in, messages out. */
interface Scope {
  postMessage: (message: FromWorker) => void;
  onmessage: ((event: { data: ToWorker }) => void) | null;
}

let posted: FromWorker[];
let scope: Scope;
const send = (data: ToWorker | { type: string }) => scope.onmessage!({ data: data as ToWorker });

beforeEach(async () => {
  posted = [];
  scope = { postMessage: (m) => posted.push(m), onmessage: null };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("./worker");
});
afterEach(() => {
  send({ type: "stop" });
  vi.unstubAllGlobals();
});

describe("the emulator worker", () => {
  it("loads a program and says how big it is", () => {
    send({ type: "load", board: "uno", hex });
    expect(posted).toEqual([{ type: "loaded", programBytes: expect.any(Number) }]);
    const loaded = posted[0] as Extract<FromWorker, { type: "loaded" }>;
    expect(loaded.programBytes).toBeGreaterThan(800);
  });

  it("stopping reports the board stopped, at its simulated time", () => {
    send({ type: "load", board: "uno", hex });
    send({ type: "stop" });
    expect(posted.at(-1)).toEqual({ type: "status", running: false, simMs: 0, speedPercent: 0 });
  });

  it("a file that isn't a program comes back as an error message, not a crash", () => {
    send({ type: "load", board: "uno", hex: "not hex" });
    expect(posted).toEqual([
      { type: "error", message: expect.stringMatching(/isn't an Intel HEX file/) },
    ]);
  });

  it("before a program is loaded, messages for the board are ignored", () => {
    send({ type: "input", pin: 2, high: true });
    send({ type: "serial-in", text: "hi" });
    send({ type: "world-obstacles", obstacles: [] });
    send({ type: "stop" });
    expect(posted).toEqual([]);
  });

  it("messages it doesn't know are ignored, as from an older or newer app", () => {
    send({ type: "load", board: "uno", hex });
    send({ type: "teleport" });
    send({ type: "constructor" });
    expect(posted).toHaveLength(1);
  });

  it("takes inputs and serial text for a loaded board", () => {
    send({ type: "load", board: "uno", hex });
    send({ type: "input", pin: 2, high: true });
    send({ type: "serial-in", text: "hello" });
    send({ type: "peripherals", inputs: [] });
    expect(posted.filter((m) => m.type === "error")).toEqual([]);
  });
});

describe("a running board", () => {
  const fixture = (name: string) =>
    readFileSync(join(__dirname, "../../test/fixtures", name), "utf8");
  const of = <T extends FromWorker["type"]>(type: T) =>
    posted.filter((m): m is Extract<FromWorker, { type: T }> => m.type === type);

  it("reports readings as it runs, with the pins it changed and the serial it printed", async () => {
    send({ type: "load", board: "uno", hex: fixture("hello-serial-uno.hex") });
    send({ type: "start" });
    await vi.waitFor(
      () =>
        expect(
          of("serial")
            .map((m) => m.text)
            .join(""),
        ).toMatch(/^Kiungo\r?\n0\r?\n/),
      {
        timeout: 20_000,
      },
    );
    const reading = of("readings").at(-1)!;
    expect(reading).toMatchObject({ crashed: null, simMs: expect.any(Number) });
    expect(reading).not.toHaveProperty("world");
  }, 30_000);

  it("writes pin levels into the shared buffer instead of posting them", async () => {
    const pins = new SharedArrayBuffer(64);
    // Blink sets pin 13 to an output, low, as soon as setup() runs.
    send({ type: "load", board: "uno", hex, pins });
    send({ type: "start" });
    await vi.waitFor(() => expect(new Uint8Array(pins)[13]).not.toBe(0), { timeout: 20_000 });
    expect(
      of("pins")
        .flatMap((m) => m.changes)
        .filter((c) => c.pin === 13),
    ).toEqual([]);
  }, 30_000);

  it("without a shared buffer, pin changes are posted", async () => {
    send({ type: "load", board: "uno", hex });
    send({ type: "start" });
    await vi.waitFor(() => expect(of("pins").length).toBeGreaterThan(0), { timeout: 20_000 });
  }, 30_000);
});
