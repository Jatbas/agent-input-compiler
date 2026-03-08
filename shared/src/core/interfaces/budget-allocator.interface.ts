// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";
import type { SessionBudgetContext } from "#core/types/session-budget-context.js";

export interface BudgetAllocator {
  allocate(
    rulePack: RulePack,
    taskClass: TaskClass,
    sessionContext?: SessionBudgetContext,
  ): TokenCount;
}
