import { BaseArgsSchema } from "./base-args.js";

export const StatusArgsSchema = BaseArgsSchema;
export type StatusArgs = typeof StatusArgsSchema._output;
