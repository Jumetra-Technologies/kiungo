// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNO } from "../boards";
import { AvrBoard } from "./";
import { Dht, dhtBytes, ECHO_US_PER_CM, HcSr04, Peripherals } from "./peripherals";

const hex = (name: string) =>
  readFileSync(join(__dirname, "../../test/fixtures", "sketches", `${name}-uno.hex`), "utf8");

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
    expect(Number.parseFloat(lines[0]!)).toBeCloseTo(10, 0);
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
    expect(Number.parseInt(serial().split("\r\n")[0]!, 10)).toBeGreaterThanOrEqual(203);
    expect(Number.parseInt(serial().split("\r\n")[0]!, 10)).toBeLessThanOrEqual(205);
    expect(board.level(13)).toBe("high");
    peripherals.apply([{ kind: "analog", id: "l1", pin: 14, volts: 4.0 }]);
    board.runMs(300);
    expect(board.level(13)).toBe("low");
  }, 30_000);
});
