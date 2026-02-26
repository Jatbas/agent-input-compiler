import { z } from "zod";

export const InspectRequestSchema = {
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
} as const;
