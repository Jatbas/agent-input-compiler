import { z } from "zod";
import { BaseArgsSchema } from "./base-args.js";

export const CompilationArgsSchema = BaseArgsSchema.extend({
  intent: z.string().min(1).max(10_000),
});
export type CompilationArgs = z.infer<typeof CompilationArgsSchema>;
