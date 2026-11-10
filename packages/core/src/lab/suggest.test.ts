import { describe, expect, it } from "vitest";
import { PARTS, getPart } from "../parts";
import { getPinout } from "./pinout";
import { fitFor, suggest } from "./suggest";
import type { LabNode } from "./types";

let seq = 0;

const node = (partId: string, x = 0, y = 0, label?: string): LabNode => ({
  id: `n${++seq}`,
  partId,
  label: label ?? partId,
  x,
  y,
  mode: "virtual",
});

describe("suggestions", () => {
  it("starts an empty build with a board", () => {
    expect(getPinout(suggest("", []).items[0]!.part.id).controller).toBe(true);
  });

  it("puts the project's own hardware list first, then what the brief mentions, one part per need", () => {
    const project = {
      name: "Greenhouse",
      description: "Watch soil moisture and temperature",
      hardware: ["soil sensor"],
      category: "iot",
    };
    const esp = node("esp32");
    const items = suggest("", [esp], project).items.map((i) => i.part.id);
    expect(items[0]).toBe("soil-moisture");
    expect(items).toContain("dht22");
    expect(items).not.toContain("dht11");
  });

  it("corrects typos and says how a part fits the board", () => {
    const { items, didYouMean } = suggest("temprature", []);
    expect(didYouMean).toBe(true);
    expect(items.map((i) => i.part.id)).toContain("dht11");
    const esp = node("esp32");
    expect(fitFor("hc-sr04", [esp])).toMatchObject({
      tone: "warn",
      text: expect.stringContaining("divider"),
    });
    expect(fitFor("dht22", [esp])).toMatchObject({ tone: "ok" });
    expect(fitFor("led", [])).toMatchObject({ tone: "warn", text: "Add a board to drive it" });
  });
});

it("uses the catalogue's part names for every part it can add", () => {
  for (const part of PARTS) expect(getPart(part.id)?.name).toBeTruthy();
});

describe("how a part fits the board on the canvas", () => {
  const on = (board: string) => [node(board)];
  it("passives share the board's supply; a resistor goes with an LED", () => {
    expect(fitFor("breadboard", on("arduino-uno"))).toEqual({
      tone: "ok",
      text: "Shares the Arduino 5 V and GND with every part",
    });
    expect(fitFor("breadboard", on("esp32"))?.text).toBe(
      "Shares the ESP32 3.3 V and GND with every part",
    );
    expect(fitFor("breadboard", [])?.text).toBe("Shares one 5 V pin with every part");
    expect(fitFor("resistor", [])?.text).toBe("Goes in series with an LED: 220 Ω at 5 V");
  });

  it("a second board links to the first; a board on its own needs no fit", () => {
    expect(fitFor("esp32", on("arduino-uno"))?.text).toBe(
      "A second board: link them over serial or I²C",
    );
    expect(fitFor("arduino-uno", [])).toBeUndefined();
  });

  it("warns about supply, logic level and missing analog inputs", () => {
    expect(fitFor("hc-sr04", on("microbit"))).toEqual({
      tone: "warn",
      text: "Needs 4.5–5.5 V; BBC can't supply it",
    });
    expect(fitFor("bmp280", on("arduino-uno"))?.text).toBe(
      "3.3 V part: run it from Arduino's 3.3V pin",
    );
    expect(fitFor("ldr", on("raspberry-pi-4"))?.text).toBe("Raspberry has no analog inputs");
    expect(fitFor("dht11", on("microbit"))).toEqual({ tone: "ok", text: "Works with BBC (3.3 V)" });
  });
});

describe("the default suggestions", () => {
  it("offers the board the brief asks for first", () => {
    const wifi = suggest("", [], {
      name: "Weather station",
      description: "wifi cloud temperature humidity",
    });
    expect(wifi.items.slice(0, 2).map((i) => i.part.id)).toEqual(["esp32", "arduino-uno"]);
    expect(wifi.items.find((i) => i.part.id === "dht22")?.reason).toContain("“Weather station”");
    const cam = suggest("", [], { name: "Cam", description: "camera vision python" });
    expect(cam.items[0]).toMatchObject({ part: { id: "raspberry-pi-4" }, source: "missing" });
  });

  it("a lone board starts with a blink; parts bring the parts that go with them", () => {
    const lone = suggest("", [node("arduino-uno")]).items;
    expect(lone[0]).toMatchObject({ part: { id: "led" }, source: "pairs" });
    const ids = suggest("", [
      node("arduino-uno"),
      node("dht11", 0, 0, "DHT"),
      node("led", 0, 0, "LED"),
    ]).items;
    expect(ids[0]).toMatchObject({
      part: { id: "oled-ssd1306" },
      reason: expect.stringContaining("with your DHT"),
    });
    expect(ids[1]).toMatchObject({
      part: { id: "ldr" },
      reason: expect.stringContaining("with your LED"),
    });
    // A temperature sensor is on the canvas: the popular one isn't offered again.
    expect(ids.map((i) => i.part.id)).not.toContain("dht11");
  });

  it("several powered parts and no breadboard: a breadboard for the rail", () => {
    const items = suggest("", [node("arduino-uno"), node("dht11"), node("hc-sr04")]).items;
    expect(items[0]).toMatchObject({
      part: { id: "breadboard" },
      reason: "2 parts need 5 V and GND: feed them from a power rail",
    });
  });

  it("a search lists parts that fit first, up to the limit; short typos find nothing", () => {
    const { items } = suggest("led", [node("esp32")], null, 3);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.source === "search")).toBe(true);
    expect(suggest("zq", [])).toEqual({ items: [], didYouMean: true });
  });
});
