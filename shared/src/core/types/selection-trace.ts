// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";

export const EXCLUSION_REASON = {
  INCLUDE_PATTERN_MISMATCH: "include_pattern_mismatch",
  EXCLUDE_PATTERN_MATCH: "exclude_pattern_match",
  MAX_FILES: "max_files",
  BUDGET_EXCEEDED: "budget_exceeded",
  GUARD_BLOCKED: "guard_blocked",
  ZERO_SEMANTIC_SIGNAL: "zero_semantic_signal",
} as const;

export type ExclusionReason = (typeof EXCLUSION_REASON)[keyof typeof EXCLUSION_REASON];

export interface SelectionTraceSelectedRow {
  readonly path: RelativePath;
  readonly score: number;
  readonly signals: {
    readonly pathRelevance: number;
    readonly importProximity: number;
    readonly symbolRelevance: number;
    readonly recency: number;
    readonly sizePenalty: number;
    readonly ruleBoostCount: number;
    readonly rulePenaltyCount: number;
  };
}

export interface SelectionTraceExcludedRow {
  readonly path: RelativePath;
  readonly score: number;
  readonly reason: ExclusionReason;
}

export interface SelectionTrace {
  readonly selectedFiles: readonly SelectionTraceSelectedRow[];
  readonly excludedFiles: readonly SelectionTraceExcludedRow[];
}
