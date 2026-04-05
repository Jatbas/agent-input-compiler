// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

export function sumFileTokens(files: readonly SelectedFile[]): TokenCount {
  const n = files.reduce((acc, f) => acc + f.estimatedTokens, 0);
  return toTokenCount(n);
}

export function sumTransformTokens(
  metadata: readonly { readonly transformedTokens: TokenCount }[],
): TokenCount {
  const n = metadata.reduce((acc, m) => acc + m.transformedTokens, 0);
  return toTokenCount(n);
}

export function buildSummarisationTiers(
  files: readonly SelectedFile[],
): Readonly<Record<InclusionTier, number>> {
  const tiers: readonly InclusionTier[] = [
    INCLUSION_TIER.L0,
    INCLUSION_TIER.L1,
    INCLUSION_TIER.L2,
    INCLUSION_TIER.L3,
  ];
  const entries = tiers.map((tier): [InclusionTier, number] => [
    tier,
    files.reduce((n, f) => (f.tier === tier ? n + 1 : n), 0),
  ]);
  return Object.fromEntries(entries) as Readonly<Record<InclusionTier, number>>;
}
