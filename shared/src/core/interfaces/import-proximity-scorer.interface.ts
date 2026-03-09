// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";

export interface ImportProximityScorer {
  getScores(
    repo: RepoMap,
    task: TaskClassification,
  ): Promise<ReadonlyMap<RelativePath, number>>;
}
