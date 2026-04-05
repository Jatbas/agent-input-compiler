// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { buildSummarisationTiers } from "../token-summary.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";

describe("token-summary", () => {
  it("buildSummarisationTiers_counts_per_tier", () => {
    const files: readonly SelectedFile[] = [
      {
        path: toRelativePath("a.ts"),
        language: "typescript",
        estimatedTokens: toTokenCount(1),
        relevanceScore: toRelevanceScore(0.1),
        tier: INCLUSION_TIER.L0,
      },
      {
        path: toRelativePath("b.ts"),
        language: "typescript",
        estimatedTokens: toTokenCount(1),
        relevanceScore: toRelevanceScore(0.1),
        tier: INCLUSION_TIER.L0,
      },
      {
        path: toRelativePath("c.ts"),
        language: "typescript",
        estimatedTokens: toTokenCount(1),
        relevanceScore: toRelevanceScore(0.1),
        tier: INCLUSION_TIER.L1,
      },
      {
        path: toRelativePath("d.ts"),
        language: "typescript",
        estimatedTokens: toTokenCount(1),
        relevanceScore: toRelevanceScore(0.1),
        tier: INCLUSION_TIER.L3,
      },
    ];
    expect(buildSummarisationTiers(files)).toEqual({
      [INCLUSION_TIER.L0]: 2,
      [INCLUSION_TIER.L1]: 1,
      [INCLUSION_TIER.L2]: 0,
      [INCLUSION_TIER.L3]: 1,
    });
  });
});
