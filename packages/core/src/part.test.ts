import { describe, expect, it } from "vitest";
import { PartDefinitionSchema } from "./part";

const validPart = () => ({
  id: "sensor",
  name: "Sensor",
  category: "sensor",
  pins: [
    { id: "VCC", electricalType: "power" },
    { id: "OUT", electricalType: "output" },
  ],
});

describe("PartDefinitionSchema", () => {
  it("accepts a minimal part", () => {
    expect(PartDefinitionSchema.safeParse(validPart()).success).toBe(true);
  });

  it("defaults bom accessories to an empty list", () => {
    const parsed = PartDefinitionSchema.parse({ ...validPart(), bom: { mpn: "X1" } });
    expect(parsed.bom?.accessories).toEqual([]);
  });

  it("rejects an unknown electrical type", () => {
    const part = validPart();
    part.pins[0] = { id: "VCC", electricalType: "magic" };
    expect(PartDefinitionSchema.safeParse(part).success).toBe(false);
  });

  it("rejects duplicate pin ids", () => {
    const part = validPart();
    part.pins.push({ id: "OUT", electricalType: "input" });
    const result = PartDefinitionSchema.safeParse(part);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("duplicate pin id OUT");
  });

  it("rejects a voltage range where min is above max", () => {
    const result = PartDefinitionSchema.safeParse({
      ...validPart(),
      ratings: { voltageMin: 6, voltageMax: 5 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a voltage range where min equals max", () => {
    const result = PartDefinitionSchema.safeParse({
      ...validPart(),
      ratings: { voltageMin: 5, voltageMax: 5 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric timing values", () => {
    expect(
      PartDefinitionSchema.safeParse({ ...validPart(), timing: { delayMs: "fast" } }).success,
    ).toBe(false);
  });
});
