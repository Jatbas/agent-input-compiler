// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RulePack } from "@jatbas/aic-shared/core/types/rule-pack.js";
import type { TaskClass } from "@jatbas/aic-shared/core/types/enums.js";
import type { TokenCount } from "@jatbas/aic-shared/core/types/units.js";
import type { SessionBudgetContext } from "@jatbas/aic-shared/core/types/session-budget-context.js";

export interface BudgetAllocator {
  allocate(
    rulePack: RulePack,
    taskClass: TaskClass,
    sessionContext?: SessionBudgetContext,
  ): TokenCount;
}
