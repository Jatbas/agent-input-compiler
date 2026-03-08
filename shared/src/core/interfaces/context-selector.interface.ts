// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "@jatbas/aic-shared/core/types/task-classification.js";
import type { RepoMap } from "@jatbas/aic-shared/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-shared/core/types/rule-pack.js";
import type { TokenCount } from "@jatbas/aic-shared/core/types/units.js";
import type { ContextResult } from "@jatbas/aic-shared/core/types/selected-file.js";

export interface ContextSelector {
  selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
  ): Promise<ContextResult>;
}
