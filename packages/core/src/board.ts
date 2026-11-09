import { z } from "zod";
import { findDuplicates } from "./util";

/** HWT-01 / HWT-11: one JSON definition per board, the single source of hardware truth. */
export const BoardDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    fqbn: z.string().min(1),
    mcu: z.string().min(1),
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
        id: z.string().min(1),
        functions: z.array(z.enum(["digital", "pwm", "adc", "dac", "touch", "interrupt"])),
        reserved: z.boolean().default(false),
      }),
    ),
    emulator: z.enum(["avr8js", "rp2040js", "qemu", "none"]),
  })
  .superRefine((board, ctx) => {
    for (const id of findDuplicates(board.pins.map((pin) => pin.id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pins"],
        message: `duplicate pin id ${id}`,
      });
    }
  });
export type BoardDefinition = z.infer<typeof BoardDefinitionSchema>;
