// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TokenCount, StepIndex } from "@jatbas/aic-core/core/types/units.js";
import type { RelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
  readonly previouslyShownAtStep?: StepIndex;
  readonly resolvedContent?: string;
}

export interface ContextResult {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: TokenCount;
  readonly truncated: boolean;
}
