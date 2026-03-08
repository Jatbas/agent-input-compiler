// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

const compilationRequestShape = {
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  modelId: z
    .string()
    .max(256)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .default(null),
  editorId: z.enum(["cursor", "claude-code", "generic"]).optional(),
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
} as const;

export const CompilationRequestSchema: typeof compilationRequestShape =
  compilationRequestShape;
