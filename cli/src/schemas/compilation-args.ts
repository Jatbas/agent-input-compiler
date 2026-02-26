import { z } from "zod";

export const CompilationArgsSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type CompilationArgs = z.infer<typeof CompilationArgsSchema>;
