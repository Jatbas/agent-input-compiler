// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

export const MCP_INTENT_OMITTED_DEFAULT = "general context compilation" as const;

const compilationRequestShape = {
  intent: z
    .string()
    .min(1)
    .max(10_000)
    .describe("Short summary of the user's current message or task."),
  projectRoot: z
    .string()
    .min(1)
    .describe(
      "Absolute path to the project root directory (the workspace folder open in the editor).",
    ),
  modelId: z
    .string()
    .max(256)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .default(null),
  editorId: z.enum(["cursor", "cursor-claude-code", "claude-code", "generic"]).optional(),
  configPath: z
    .string()
    .max(4096)
    .regex(/\.json$/)
    .nullable()
    .default(null),
  triggerSource: z
    .enum([
      "session_start",
      "prompt_submit",
      "tool_gate",
      "subagent_start",
      "subagent_stop",
      "cli",
      "model_initiated",
      "internal_test",
    ])
    .optional(),
  conversationId: z
    .string()
    .max(128)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .optional(),
  reparentFromConversationId: z
    .string()
    .max(128)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .optional(),
  stepIndex: z.number().int().min(0).max(10_000).optional(),
  stepIntent: z.string().max(10_000).optional(),
  previousFiles: z.array(z.string().min(1).max(4096)).max(500).optional(),
  toolOutputs: z
    .array(
      z.object({
        type: z.enum(["test-result", "lint-error", "build-output", "command-output"]),
        content: z.string().max(50_000),
        relatedFiles: z.array(z.string().min(1).max(4096)).max(100).optional(),
      }),
    )
    .max(20)
    .optional(),
  conversationTokens: z.number().int().min(0).max(2_000_000).optional(),
} as const;

export const SanitisedCacheIdsSchema = z.object({
  modelId: z
    .string()
    .max(256)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .default(null),
  conversationId: z
    .string()
    .max(128)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .optional(),
  editorId: z
    .enum(["cursor", "cursor-claude-code", "claude-code", "generic"])
    .default("generic"),
});
export type SanitisedCacheIds = z.infer<typeof SanitisedCacheIdsSchema>;

export const CompilationRequestSchema: typeof compilationRequestShape =
  compilationRequestShape;
