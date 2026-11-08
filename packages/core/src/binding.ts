import { z } from "zod";

/** RUN-01: every part has exactly one binding. */
export const BindingSchema = z.enum(["virtual", "physical", "simulator", "hybrid"]);
export type Binding = z.infer<typeof BindingSchema>;

/** RUN-02: where a board's code runs. */
export const BoardTargetSchema = z.enum(["emulated", "real"]);
export type BoardTarget = z.infer<typeof BoardTargetSchema>;

/** INJ-05: build profiles. */
export const BuildProfileSchema = z.enum(["simulation", "hybrid", "ship"]);
export type BuildProfile = z.infer<typeof BuildProfileSchema>;
