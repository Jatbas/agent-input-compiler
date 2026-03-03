import { z } from "zod";
import { BaseArgsSchema } from "./base-args.js";

export const InitArgsSchema = BaseArgsSchema;
export type InitArgs = z.infer<typeof InitArgsSchema>;
