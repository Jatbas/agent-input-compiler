// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TokenCount } from "#core/types/units.js";
import type { ContextResult } from "#core/types/selected-file.js";

export interface ContextSelector {
  selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
  ): Promise<ContextResult>;
}
