import { z } from "zod";

export const StatusArgsSchema = z.object({
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type StatusArgs = z.infer<typeof StatusArgsSchema>;
