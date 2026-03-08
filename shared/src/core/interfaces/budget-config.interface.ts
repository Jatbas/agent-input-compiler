// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TokenCount } from "@jatbas/aic-shared/core/types/units.js";
import type { TaskClass } from "@jatbas/aic-shared/core/types/enums.js";

export interface BudgetConfig {
  getMaxTokens(): TokenCount;
  getBudgetForTaskClass(taskClass: TaskClass): TokenCount | null;
}
