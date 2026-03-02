import { z } from "zod";
import { BaseArgsSchema } from "./base-args.js";

export const CompilationArgsSchema = BaseArgsSchema.extend({
  intent: z.string().min(1).max(10_000),
  triggerSource: z
    .enum([
      "session_start",
      "prompt_submit",
      "tool_gate",
      "subagent_start",
      "cli",
      "model_initiated",
    ])
    .default("cli"),
  conversationId: z.string().min(1).optional(),
});
export type CompilationArgs = z.infer<typeof CompilationArgsSchema>;
