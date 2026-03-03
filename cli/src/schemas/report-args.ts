import { BaseArgsSchema } from "./base-args.js";
import { z } from "zod";

export const ReportArgsSchema = BaseArgsSchema.extend({
  outputPath: z.string().nullable().default(null),
});
export type ReportArgs = z.infer<typeof ReportArgsSchema>;
