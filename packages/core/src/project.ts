import { z } from "zod";
import { BindingSchema, BoardTargetSchema, BuildProfileSchema } from "./binding";

/** PRJ-01: kiungo.json */
export const ProjectManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    name: z.string().min(1),
    board: z.string(),
    profile: BuildProfileSchema.default("simulation"),
  })
  .passthrough(); // unknown fields are preserved so newer files survive an older app

/** PRJ-01: circuit.json */
export const CircuitSchema = z
  .object({
    boards: z.array(
      z.object({
        id: z.string(),
        definition: z.string(),
        target: BoardTargetSchema.default("emulated"),
        port: z.string().optional(),
      }),
    ),
    parts: z.array(
      z.object({
        id: z.string(),
        definition: z.string(),
        binding: BindingSchema.default("virtual"),
        driver: z.string().optional(),
      }),
    ),
    wires: z.array(z.object({ from: z.string(), to: z.string() })),
  })
  .passthrough();

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
export type Circuit = z.infer<typeof CircuitSchema>;
