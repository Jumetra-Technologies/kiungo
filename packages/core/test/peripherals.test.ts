// @vitest-environment node
/**
 * The user's own sketches against parts that answer like the real ones
 * (EMU-02, DBG-01). The sketches are Kiungo's starters for the Uno and two
 * from Brad's Sprint 7 check (a tone() melody, a stack that runs out of RAM),
 * compiled with avr-gcc 7.3 and the arduino:avr 1.8.6 core the way Arduino
 * CLI does (fixtures/sketches/build.sh); the sizes match Arduino CLI's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNO } from "../src/boards";
import { AvrBoard } from "../src/emulator";
import { Dht, dhtBytes, ECHO_US_PER_CM, HcSr04, Peripherals } from "../src/emulator/peripherals";
import { PinStats } from "../src/emulator/pinstats";

const hex = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "sketches", `${name}-uno.hex`), "utf8");

function run(name: string) {
  const board = new AvrBoard(UNO, hex(name));
  let serial = "";
  board.onSerialByte((b) => (serial += String.fromCharCode(b)));
  const peripherals = new Peripherals(board);
  return { board, peripherals, serial: () => serial };
}

describe("an HC-SR04 that answers pulseIn (the Distance sensor starter)", () => {
  it("reports the distance set, to the centimeter", () => {
    const { board, peripherals, serial } = run("distance");
    peripherals.apply([{ kind: "hc-sr04", id: "s1", trig: 2, echo: 3, distanceCm: 42 }]);
    board.runMs(700);
    const lines = serial().split("\r\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(Number.parseFloat(line)).toBeCloseTo(42, 0);
    expect((peripherals.get("s1") as HcSr04).echoes).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("follows a change, and says nothing in range when there's nothing", () => {
    const { board, peripherals, serial } = run("distance");
    peripherals.apply([{ kind: "hc-sr04", id: "s1", trig: 2, echo: 3, distanceCm: 10 }]);
    board.runMs(450);
    peripherals.apply([{ kind: "hc-sr04", id: "s1", trig: 2, echo: 3, distanceCm: 500 }]);
    board.runMs(600);
    const lines = serial().split("\r\n").filter(Boolean);
    expect(Number.parseFloat(lines[0])).toBeCloseTo(10, 0);
    expect(lines.at(-1)).toBe("Nothing in range");
  }, 30_000);

  it("the echo is as long as the round trip", () => {
    expect(ECHO_US_PER_CM).toBeCloseTo(58.3, 1);
  });
});

describe("a DHT11 that answers the DHT library (the Temperature and humidity starter)", () => {
  it("encodes its readings as the datasheet says", () => {
    expect(dhtBytes(11, 23.4, 55)).toEqual([55, 0, 23, 4, (55 + 23 + 4) & 0xff]);
    expect(dhtBytes(22, -1.5, 40.2)).toEqual([1, 146, 0x80, 15, (1 + 146 + 0x80 + 15) & 0xff]);
  });

  it("the library reads the temperature and humidity set", () => {
    const { board, peripherals, serial } = run("dht11");
    peripherals.apply([
      { kind: "dht", id: "d1", pin: 2, model: 11, temperatureC: 23.4, humidity: 55 },
    ]);
    board.runMs(4300);
    expect(serial()).toContain("Temperature: 23.40 C, humidity: 55.00 %");
    expect((peripherals.get("d1") as Dht).reads).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("with no sensor wired, the sketch says it got no reading, as on a real board", () => {
    const { board, serial } = run("dht11");
    board.runMs(2300);
    expect(serial()).toContain("No reading from the DHT11. Check its wiring.");
  }, 60_000);
});

describe("analog inputs (the Night light starter)", () => {
  it("analogRead sees the voltage set, and the sketch acts on it", () => {
    const { board, peripherals, serial } = run("night-light");
    peripherals.apply([{ kind: "analog", id: "l1", pin: 14, volts: 1.0 }]);
    board.runMs(300);
    // 1.0 V of 5 V is 204 of 1023: dark, so the LED is on.
    expect(Number.parseInt(serial().split("\r\n")[0], 10)).toBeGreaterThanOrEqual(203);
    expect(Number.parseInt(serial().split("\r\n")[0], 10)).toBeLessThanOrEqual(205);
    expect(board.level(13)).toBe("high");
    peripherals.apply([{ kind: "analog", id: "l1", pin: 14, volts: 4.0 }]);
    board.runMs(300);
    expect(board.level(13)).toBe("low");
  }, 30_000);
});

describe("what the pins do, measured (DBG-01)", () => {
  it("a servo sweep: the pulse width follows the angle (Servo library)", () => {
    const { board } = run("servo");
    const stats = new PinStats(UNO.clockHz, [3]);
    board.onPinChange((c) => stats.record(c));
    board.runMs(100);
    stats.take(board.cycles);
    // The sweep starts at 0°: 544 µs is the Servo library's 0°.
    board.runMs(60);
    const start = stats.take(board.cycles)[0];
    expect(start.pulseUs).toBeGreaterThan(540);
    expect(start.pulseUs).toBeLessThan(700);
    // 15 ms per degree: after 1.5 s it's near 100°.
    board.runMs(1400);
    stats.take(board.cycles);
    board.runMs(60);
    const later = stats.take(board.cycles)[0];
    expect(later.pulseUs).toBeGreaterThan(1500);
    // A servo pulse every 20 ms: 50 Hz.
    expect(later.hz).toBeCloseTo(50, -1);
  }, 60_000);

  it("a tone() melody: the pin's pitch is each note's", () => {
    const { board } = run("melody");
    const stats = new PinStats(UNO.clockHz, [8]);
    board.onPinChange((c) => stats.record(c));
    const heard: number[] = [];
    for (let i = 0; i < 4; i++) {
      board.runMs(50);
      stats.take(board.cycles);
      board.runMs(100);
      heard.push(Math.round(stats.take(board.cycles)[0].hz));
      board.runMs(100);
    }
    expect(heard[0]).toBeCloseTo(262, -1);
    expect(heard[1]).toBeCloseTo(330, -1);
    expect(heard[2]).toBeCloseTo(392, -1);
    expect(heard[3]).toBeCloseTo(523, -1);
  }, 60_000);

  it("blink: duty is the share of time high", () => {
    const board = new AvrBoard(
      UNO,
      readFileSync(join(__dirname, "fixtures", "blink-uno.hex"), "utf8"),
    );
    const stats = new PinStats(UNO.clockHz, [13]);
    board.onPinChange((c) => stats.record(c));
    board.runMs(4000);
    const r = stats.take(board.cycles)[0];
    expect(r.duty).toBeCloseTo(0.5, 1);
    // On for a second, off for a second: 0.5 Hz, far below anything audible.
    expect(r.hz).toBeCloseTo(0.5, 1);
  }, 30_000);
});

describe("running out of RAM (HWT-07)", () => {
  it("the stack runs over the chip's registers and the board stops, as a real one does", () => {
    const { board, serial } = run("stack");
    board.runMs(200);
    // It got as far as starting to print, then the stack ate the RAM: that's all a real Uno prints too.
    expect(serial().length).toBeGreaterThan(0);
    expect("start\r\n".startsWith(serial())).toBe(true);
    expect(board.crashed).not.toBeNull();
    // Nothing runs after a crash.
    const at = board.cycles;
    board.runMs(100);
    expect(board.cycles).toBe(at);
  }, 60_000);

  it("a program that fits keeps running", () => {
    const { board, peripherals } = run("distance");
    peripherals.apply([{ kind: "hc-sr04", id: "s1", trig: 2, echo: 3, distanceCm: 42 }]);
    board.runMs(500);
    expect(board.crashed).toBeNull();
  }, 30_000);
});
