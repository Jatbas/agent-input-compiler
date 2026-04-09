// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

export const aicCompileSanitizedMetaSchema = z.object({
  intent: z.string(),
  taskClass: z.enum(["refactor", "bugfix", "feature", "docs", "test", "general"]),
  filesSelected: z.number().int().min(0),
  filesTotal: z.number().int().min(0),
  tokensRaw: z.number().int().min(0),
  tokensCompiled: z.number().int().min(0),
  tokenReductionPct: z.number(),
  cacheHit: z.boolean(),
  durationMs: z.number().int().min(0),
  modelId: z.string(),
  editorId: z.enum(["cursor", "claude-code", "cursor-claude-code", "generic"]),
  transformTokensSaved: z.number().int().min(0),
  summarisationTiers: z.object({
    L0: z.number().int().min(0),
    L1: z.number().int().min(0),
    L2: z.number().int().min(0),
    L3: z.number().int().min(0),
  }),
  contextCompleteness: z.number(),
  guard: z.union([
    z.null(),
    z.object({
      passed: z.boolean(),
      findings: z.array(
        z.object({
          severity: z.enum(["block", "warn"]),
          type: z.enum([
            "secret",
            "excluded-file",
            "prompt-injection",
            "command-injection",
          ]),
          line: z.number().int().optional(),
          message: z.string(),
          pattern: z.string().optional(),
        }),
      ),
      filesBlocked: z.array(z.string()),
      filesRedacted: z.array(z.string()),
      filesWarned: z.array(z.string()),
    }),
  ]),
});

const aicCompileReparentBranchSchema = z
  .object({
    reparented: z.literal(true),
    rowsUpdated: z.number().int().min(0),
  })
  .strict();

const aicCompileDisabledBranchSchema = z
  .object({
    compiledPrompt: z.string(),
    meta: z.object({}).strict(),
    conversationId: z.string().nullable(),
  })
  .strict();

const aicCompileSuccessBranchSchema = z
  .object({
    compiledPrompt: z.string(),
    meta: aicCompileSanitizedMetaSchema,
    conversationId: z.string().nullable(),
    updateMessage: z.string().nullable(),
    configUpgraded: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

export const AicCompileStructuredContentSchema = z.union([
  aicCompileReparentBranchSchema,
  aicCompileDisabledBranchSchema,
  aicCompileSuccessBranchSchema,
]);

const specTypeTierSchema = z.enum(["verbatim", "signature-path", "path-only"]);

const aicCompileSpecSuccessBranchSchema = z
  .object({
    compiledSpec: z.string(),
    meta: z.object({
      totalTokensRaw: z.number().int().min(0),
      totalTokensCompiled: z.number().int().min(0),
      reductionPct: z.number(),
      typeTiers: z.record(specTypeTierSchema),
      transformTokensSaved: z.number().int().min(0),
    }),
  })
  .strict();

const aicCompileSpecValidationErrorBranchSchema = z
  .object({
    error: z.string(),
    code: z.literal("validation-error"),
  })
  .strict();

export const AicCompileSpecStructuredContentSchema = z.union([
  aicCompileSpecSuccessBranchSchema,
  aicCompileSpecValidationErrorBranchSchema,
]);

// MCP SDK output validation uses normalizeObjectSchema, which rejects top-level z.union.
export const AicCompileToolRegisteredOutputSchema = z
  .object({
    reparented: z.literal(true).optional(),
    rowsUpdated: z.number().int().min(0).optional(),
    compiledPrompt: z.string().optional(),
    meta: z.union([z.object({}).strict(), aicCompileSanitizedMetaSchema]).optional(),
    conversationId: z.string().nullable().optional(),
    updateMessage: z.string().nullable().optional(),
    configUpgraded: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  })
  .passthrough();

export const AicCompileSpecToolRegisteredOutputSchema = z
  .object({
    compiledSpec: z.string().optional(),
    meta: z
      .object({
        totalTokensRaw: z.number().int().min(0),
        totalTokensCompiled: z.number().int().min(0),
        reductionPct: z.number(),
        typeTiers: z.record(specTypeTierSchema),
        transformTokensSaved: z.number().int().min(0),
      })
      .optional(),
    error: z.string().optional(),
    code: z.literal("validation-error").optional(),
  })
  .passthrough();

export type AicCompileStructuredContent = z.infer<
  typeof AicCompileStructuredContentSchema
>;
export type AicCompileSpecStructuredContent = z.infer<
  typeof AicCompileSpecStructuredContentSchema
>;
