// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";
import { EXCLUSION_REASON } from "@jatbas/aic-core/core/types/selection-trace.js";

const exclusionReasonSchema = z.enum([
  EXCLUSION_REASON.INCLUDE_PATTERN_MISMATCH,
  EXCLUSION_REASON.EXCLUDE_PATTERN_MATCH,
  EXCLUSION_REASON.MAX_FILES,
  EXCLUSION_REASON.BUDGET_EXCEEDED,
  EXCLUSION_REASON.GUARD_BLOCKED,
]);

const selectionTraceSignalsSchema = z.object({
  pathRelevance: z.number(),
  importProximity: z.number(),
  symbolRelevance: z.number(),
  recency: z.number(),
  sizePenalty: z.number(),
  ruleBoostCount: z.number().int(),
  rulePenaltyCount: z.number().int(),
});

const selectionTraceSelectedRowSchema = z.object({
  path: z.string().min(1).max(4096),
  score: z.number(),
  signals: selectionTraceSignalsSchema,
});

const selectionTraceExcludedRowSchema = z.object({
  path: z.string().min(1).max(4096),
  score: z.number(),
  reason: exclusionReasonSchema,
});

export const SelectionTraceSchema = z.object({
  selectedFiles: z.array(selectionTraceSelectedRowSchema),
  excludedFiles: z.array(selectionTraceExcludedRowSchema),
});

export type SelectionTraceParsed = z.infer<typeof SelectionTraceSchema>;
