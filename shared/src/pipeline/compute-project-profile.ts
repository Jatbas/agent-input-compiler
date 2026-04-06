// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { ProjectProfile } from "@jatbas/aic-core/core/types/project-profile.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

export function computeProjectProfile(repoMap: RepoMap): ProjectProfile {
  if (repoMap.files.length === 0) {
    return {
      totalFiles: repoMap.totalFiles,
      totalTokens: toTokenCount(0),
      medianFileTokens: toTokenCount(0),
      p90FileTokens: toTokenCount(0),
    };
  }
  const sortedTokens = repoMap.files
    .map((f) => f.estimatedTokens)
    .toSorted((a, b) => Number(a) - Number(b));
  const length = sortedTokens.length;
  const medianIdx = Math.floor((length - 1) / 2);
  const p90Idx = Math.min(Math.floor((length - 1) * 0.9), length - 1);
  const medianFileTokens = sortedTokens[medianIdx] ?? toTokenCount(0);
  const p90FileTokens = sortedTokens[p90Idx] ?? toTokenCount(0);
  return {
    totalFiles: repoMap.totalFiles,
    totalTokens: repoMap.totalTokens,
    medianFileTokens,
    p90FileTokens,
  };
}
