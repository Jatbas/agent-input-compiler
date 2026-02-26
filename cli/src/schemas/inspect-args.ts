import { z } from "zod";

export const InspectArgsSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type InspectArgs = z.infer<typeof InspectArgsSchema>;
