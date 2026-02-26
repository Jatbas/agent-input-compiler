import { z } from "zod";

export const BaseArgsSchema = z.object({
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type BaseArgs = z.infer<typeof BaseArgsSchema>;
