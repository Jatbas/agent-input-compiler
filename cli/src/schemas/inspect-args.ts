import { z } from "zod";
import { BaseArgsSchema } from "./base-args.js";

export const InspectArgsSchema = BaseArgsSchema.extend({
  intent: z.string().min(1).max(10_000),
});
export type InspectArgs = z.infer<typeof InspectArgsSchema>;
