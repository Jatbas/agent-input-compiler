// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RulePack } from "@jatbas/aic-shared/core/types/rule-pack.js";
import type { AbsolutePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { TaskClass } from "@jatbas/aic-shared/core/types/enums.js";

export interface RulePackProvider {
  getBuiltInPack(name: string): RulePack;
  getProjectPack(projectRoot: AbsolutePath, taskClass: TaskClass): RulePack | null;
}
