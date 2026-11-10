// @vitest-environment node
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { cobsDecode, cobsEncode } from "@kiungo/core/hybrid/cobs";
import { Frame, PROTOCOL_VERSION } from "@kiungo/core/hybrid/protocol";
import { HybridLink, type LinkEvent } from "../src/main/hybrid/link";
import { hybridFlags, hybridProfile, shimmedSource } from "../src/main/hybrid/service";
import type { CliLocation } from "../src/main/toolchain/arduino-cli";

const CLI: CliLocation = { binary: "/fake/arduino-cli", configFile: "/fake/arduino-cli.yaml" };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for `arduino-cli monitor` with a board running the Hybrid runtime behind it. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  sent: Uint8Array[] = [];
  private buf: number[] = [];
  constructor(readonly args: string[]) {
    super();
    this.stdin.on("data", (d: Buffer) => {
      for (const b of d) {
        if (b !== 0) {
          this.buf.push(b);
          continue;
        }
        this.sent.push(cobsDecode(new Uint8Array(this.buf)) ?? new Uint8Array());
        this.buf = [];
      }
    });
  }
  kill() {
    this.emit("exit", null);
    return true;
  }
  frame(bytes: number[]) {
    this.stdout.write(Buffer.from(cobsEncode(new Uint8Array(bytes))));
  }
  text(s: string) {
    this.frame([Frame.Text, ...new TextEncoder().encode(s)]);
  }
  /** The frames the PC sent, by type. */
  of(code: number) {
    return this.sent.filter((f) => f[0] === code);
  }
}

function link() {
  const children: FakeChild[] = [];
  const events: Array<LinkEvent & { port: string }> = [];
  const l = new HybridLink({
    cli: () => CLI,
    spawn: (_c, args) => {
      const child = new FakeChild(args);
      children.push(child);
      return child as unknown as ChildProcess;
    },
    onEvent: (port, event) => events.push({ port, ...event }),
    pingMs: 10,
    batchMs: 5,
    helloMs: 5,
    closeMs: 5,
  });
  return { l, children, events };
}

describe("the Hybrid link to a real board (INJ-03, INJ-04, OUT-01)", () => {
  it("opens the port at the link speed, says hello, and pings", async () => {
    const { l, children } = link();
    expect(l.start("/dev/ttyACM0")).toEqual({ ok: true });
    expect(children[0].args).toEqual(["monitor", "-p", "/dev/ttyACM0", "--config", "baudrate=115200", "--quiet"]);
    await tick(40);
    expect(children[0].of(Frame.Hello).length).toBe(1);
    expect(children[0].of(Frame.Ping).length).toBeGreaterThan(1);
    l.stop();
  });

  it("passes the handshake, the sketch's lines and what it drove to the interface", async () => {
    const { l, children, events } = link();
    l.start("/dev/ttyACM0");
    const board = children[0];
    board.frame([Frame.HelloAck, PROTOCOL_VERSION, 2]);
    board.text("42 c");
    board.text("m\nNext");
    board.frame([Frame.Out, 0, 0x20, 0, 0, 0, 0x20, 0, 0]);
    await tick(20);
    const all = events.flatMap((e) => e.lines);
    expect(all).toEqual(["42 cm"]);
    expect(events.find((e) => e.hello)?.hello).toEqual({ protocol: PROTOCOL_VERSION, compatible: true });
    expect(events.find((e) => e.out)?.out).toEqual({ levels: 1 << 13, driven: 1 << 13, pwm: [] });
    l.stop();
  });

  it("sends only values that changed, and all of them again after the board restarts", async () => {
    const { l, children } = link();
    l.start("/dev/ttyACM0");
    const board = children[0];
    l.set([
      [0, 42],
      [1, 2450],
    ]);
    l.set([
      [0, 42],
      [1, 2500],
    ]);
    await tick();
    expect(board.of(Frame.Set).length).toBe(3);
    board.frame([Frame.HelloAck, PROTOCOL_VERSION, 2]);
    await tick(20);
    expect(board.of(Frame.Set).length).toBe(5);
    l.stop();
  });

  it("an older runtime is reported as not compatible", async () => {
    const { l, children, events } = link();
    l.start("/dev/ttyACM0");
    children[0].frame([Frame.HelloAck, PROTOCOL_VERSION + 1, 0]);
    await tick(20);
    expect(events.find((e) => e.hello)?.hello?.compatible).toBe(false);
    l.stop();
  });

  it("Stop sends STOP before the port closes, so the board's outputs go safe (SAF-01)", async () => {
    const { l, children } = link();
    l.start("/dev/ttyACM0");
    await tick(20);
    l.stop();
    await tick(20);
    expect(children[0].of(Frame.Stop).map((f) => [...f])).toEqual([[Frame.Stop, 1]]);
  });

  it("the emergency stop sends STOP twice, stops pinging, and keeps listening for the board's SAFE", async () => {
    const { l, children, events } = link();
    l.start("/dev/ttyACM0");
    await tick(20);
    l.emergencyStop();
    const pings = children[0].of(Frame.Ping).length;
    expect(children[0].of(Frame.Stop).map((f) => [...f])).toEqual([
      [Frame.Stop, 2],
      [Frame.Stop, 2],
    ]);
    await tick(40);
    expect(children[0].of(Frame.Ping).length).toBe(pings);
    children[0].frame([Frame.Safe, 2]);
    await tick(20);
    expect(events.find((e) => e.safe)?.safe).toBe("emergency");
    l.stop();
  });

  it("stopping is quiet; the board going away is not", async () => {
    const { l, children, events } = link();
    l.start("/dev/ttyACM0");
    l.stop();
    expect(events.some((e) => e.closed !== undefined)).toBe(false);
    expect(l.open).toBeNull();
    l.start("/dev/ttyACM0");
    children[1].stderr.write("Error: port busy\n");
    await tick();
    children[1].emit("exit", 1);
    expect(events.at(-1)?.closed).toEqual(expect.any(String));
    expect(l.open).toBeNull();
  });
});

describe("the Hybrid copy of a sketch (INJ-01, INJ-05)", () => {
  it("each sketch file gets the marker and the shim, and keeps its line numbers", () => {
    expect(shimmedSource("sketch.ino", "void setup() {}\n").split("\n")).toEqual(['#include <kiungo_hybrid_marker.h>', '#include "kiungo_shim.h"', '#line 1 "sketch.ino"', "void setup() {}", ""]);
  });

  it("forces the shim into every C++ file, so the runtime and adapters get the pin table", () => {
    expect(hybridFlags("/u/My Projects/x/kiungo_shim.h")).toBe('compiler.cpp.extra_flags=-include "/u/My Projects/x/kiungo_shim.h"');
  });

  it("the profile keeps the board package and libraries, swaps the replaced ones, and adds Kiungo's", () => {
    const original = `profiles:
  kiungo:
    fqbn: arduino:avr:uno
    platforms:
      - platform: arduino:avr (1.8.6)
    libraries:
      - NewPing (1.9.7)
      - Servo (1.2.2)
      - dependency: Adafruit Unified Sensor (1.1.15)
default_profile: kiungo
`;
    const out = hybridProfile(original, "arduino:avr:nano:cpu=atmega328", ["/res/hybrid/KiungoHybrid", "/res/hybrid/adapters/NewPing"], ["NewPing"]);
    expect(out).toContain("fqbn: arduino:avr:nano:cpu=atmega328");
    expect(out).toContain("- platform: arduino:avr (1.8.6)");
    expect(out).toContain("- Servo (1.2.2)");
    expect(out).toContain("- dependency: Adafruit Unified Sensor (1.1.15)");
    expect(out).not.toContain("NewPing (1.9.7)");
    expect(out).toContain('- dir: "/res/hybrid/adapters/NewPing"');
    expect(out).toContain('- dir: "/res/hybrid/KiungoHybrid"');
  });
});
