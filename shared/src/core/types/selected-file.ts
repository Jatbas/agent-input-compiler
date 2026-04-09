// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TokenCount, StepIndex } from "@jatbas/aic-core/core/types/units.js";
import type { RelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import type { ExclusionReason } from "@jatbas/aic-core/core/types/selection-trace.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
  readonly previouslyShownAtStep?: StepIndex;
  readonly resolvedContent?: string;
  readonly scoreSignals?: {
    readonly pathRelevance: number;
    readonly importProximity: number;
    readonly symbolRelevance: number;
    readonly recency: number;
    readonly sizePenalty: number;
    readonly ruleBoostCount: number;
    readonly rulePenaltyCount: number;
  };
}

export interface ContextResult {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: TokenCount;
  readonly truncated: boolean;
  readonly traceExcludedFiles: readonly {
    readonly path: RelativePath;
    readonly score: number;
    readonly reason: ExclusionReason;
  }[];
}
