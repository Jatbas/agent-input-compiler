// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { GlobPattern } from "@jatbas/aic-shared/core/types/paths.js";
import type { TokenCount } from "@jatbas/aic-shared/core/types/units.js";

export interface RulePack {
  readonly name?: string;
  readonly version?: number;
  readonly description?: string;
  readonly constraints: readonly string[];
  readonly includePatterns: readonly GlobPattern[];
  readonly excludePatterns: readonly GlobPattern[];
  readonly budgetOverride?: TokenCount;
  readonly heuristic?: {
    readonly boostPatterns: readonly GlobPattern[];
    readonly penalizePatterns: readonly GlobPattern[];
  };
}
