// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";

export interface SpecFileDiscoverer {
  discover(
    specRepoMap: RepoMap,
    task: TaskClassification,
    rulePack: RulePack,
  ): ContextResult;
}
