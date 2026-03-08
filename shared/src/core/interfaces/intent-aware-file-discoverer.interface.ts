// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";

export interface IntentAwareFileDiscoverer {
  discover(repo: RepoMap, task: TaskClassification, rulePack: RulePack): RepoMap;
}
