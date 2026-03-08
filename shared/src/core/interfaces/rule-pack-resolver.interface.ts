// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";

export interface RulePackResolver {
  resolve(task: TaskClassification, projectRoot: AbsolutePath): RulePack;
}
