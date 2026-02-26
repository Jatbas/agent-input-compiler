import { z } from "zod";

export const InitArgsSchema = z.object({
  upgrade: z.boolean().optional().default(false),
});
export type InitArgs = z.infer<typeof InitArgsSchema>;
