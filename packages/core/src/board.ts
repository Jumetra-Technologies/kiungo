import { z } from "zod";

/** HWT-01 / HWT-11: one JSON definition per board, the single source of hardware truth. */
export const BoardDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  fqbn: z.string(),
  mcu: z.string(),
  clockHz: z.number().int().positive(),
  flashBytes: z.number().int().positive(),
  sramBytes: z.number().int().positive(),
  eepromBytes: z.number().int().nonnegative(),
  adcBits: z.number().int().positive(),
  adcRefVolts: z.number().positive(),
  logicVolts: z.number().positive(),
  maxPinMilliamps: z.number().positive(),
  pins: z.array(
    z.object({
      id: z.string(),
      functions: z.array(z.enum(["digital", "pwm", "adc", "dac", "touch", "interrupt"])),
      reserved: z.boolean().default(false),
    }),
  ),
  emulator: z.enum(["avr8js", "rp2040js", "qemu", "none"]),
});
export type BoardDefinition = z.infer<typeof BoardDefinitionSchema>;
