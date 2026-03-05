import { z } from "zod";

const compilationRequestShape = {
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  modelId: z.string().nullable().default(null),
  editorId: z.enum(["cursor", "claude-code", "generic"]).optional(),
  configPath: z.string().nullable().default(null),
  triggerSource: z
    .enum([
      "session_start",
      "prompt_submit",
      "tool_gate",
      "subagent_start",
      "cli",
      "model_initiated",
      "internal_test",
    ])
    .optional(),
  conversationId: z.string().min(1).nullable().optional(),
} as const;

export const CompilationRequestSchema: typeof compilationRequestShape =
  compilationRequestShape;
