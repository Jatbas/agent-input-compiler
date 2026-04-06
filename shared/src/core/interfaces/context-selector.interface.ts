// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";
import type { ToolOutput } from "@jatbas/aic-core/core/types/compilation-types.js";

export interface ContextSelector {
  selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
    toolOutputs?: readonly ToolOutput[],
  ): Promise<ContextResult>;
}
