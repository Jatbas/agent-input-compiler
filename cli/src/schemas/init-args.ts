import { z } from "zod";
import { BaseArgsSchema } from "./base-args.js";

export const InitArgsSchema = BaseArgsSchema.extend({
  upgrade: z.boolean().optional().default(false),
});
export type InitArgs = z.infer<typeof InitArgsSchema>;
