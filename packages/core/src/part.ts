import { z } from "zod";

/** PRJ-04: part definition (subset; extended as the Part SDK lands). */
export const PartDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  pins: z.array(
    z.object({
      id: z.string(),
      electricalType: z.enum(["input", "output", "power", "ground", "bidirectional"]),
    }),
  ),
  ratings: z.object({ voltageMin: z.number(), voltageMax: z.number() }).optional(),
  timing: z.record(z.number()).optional(),
  safeState: z.string().optional(),
  bom: z
    .object({ mpn: z.string().optional(), accessories: z.array(z.string()).default([]) })
    .optional(),
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
