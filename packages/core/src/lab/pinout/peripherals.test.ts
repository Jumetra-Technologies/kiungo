import { describe, expect, it } from "vitest";
import { PARTS } from "../../parts";
import { PERIPHERALS } from "./peripherals";

const by = (id: string) => PERIPHERALS.find((p) => p.partId === id)!;

describe("peripheral pinouts", () => {
  it("one for every catalog part that isn't a board, breadboard or resistor, each with a role per pin", () => {
    const ids = PERIPHERALS.map((p) => p.partId);
    expect(new Set(ids).size).toBe(ids.length);
    const catalog = new Set(PARTS.map((p) => p.id));
    for (const p of PERIPHERALS) {
      expect(catalog.has(p.partId), p.partId).toBe(true);
      expect(p.controller).toBe(false);
      expect(
        p.pins.every((pin) => pin.role),
        p.partId,
      ).toBe(true);
      expect(p.supply![0]).toBeLessThanOrEqual(p.supply![1]);
    }
  });

  it("supply ranges are the datasheets': 3.3 V radios, a 5 V ultrasonic, a 3–5.5 V DHT22", () => {
    expect(by("nrf24l01").supply).toEqual([1.9, 3.6]);
    expect(by("nrf24l01").tolerates5V).toBe(true);
    expect(by("hc-sr04").supply![0]).toBeGreaterThanOrEqual(4.5);
    expect(by("dht22").supply).toEqual([3.3, 6]);
  });

  it("I²C parts have SDA and SCL; serial parts have TX and RX", () => {
    for (const id of ["lcd-16x2", "oled-ssd1306", "mpu6050", "bmp280"]) {
      const roles = by(id).pins.map((p) => p.role);
      expect(roles, id).toEqual(expect.arrayContaining(["sda", "scl"]));
    }
    expect(by("hc-05").pins.map((p) => p.role)).toEqual(expect.arrayContaining(["tx", "rx"]));
  });
});
