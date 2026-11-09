import { z } from "zod";
import { findDuplicates } from "./util";

/** PRJ-04: part definition (subset; extended as the Part SDK lands). */
export const PartDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    pins: z.array(
      z.object({
        id: z.string().min(1),
        electricalType: z.enum(["input", "output", "power", "ground", "bidirectional"]),
      }),
    ),
    ratings: z.object({ voltageMin: z.number(), voltageMax: z.number() }).optional(),
    timing: z.record(z.number()).optional(),
    safeState: z.string().optional(),
    bom: z
      .object({ mpn: z.string().optional(), accessories: z.array(z.string()).default([]) })
      .optional(),
  })
  .superRefine((part, ctx) => {
    for (const id of findDuplicates(part.pins.map((pin) => pin.id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pins"],
        message: `duplicate pin id ${id}`,
      });
    }
    if (part.ratings && part.ratings.voltageMin > part.ratings.voltageMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratings"],
        message: "voltageMin must not exceed voltageMax",
      });
    }
  });
export type PartDefinition = z.infer<typeof PartDefinitionSchema>;

/** RUN-01: every driver (virtual, physical, simulator, hybrid) implements this. */
export interface PartDriver {
  readonly partId: string;
  /** Commands in (actuators). */
  command(name: string, value: number): void;
  /** Readings out (sensors). */
  read(): number | undefined;
}
