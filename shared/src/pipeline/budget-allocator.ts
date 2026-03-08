// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { BudgetAllocator as IBudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";
import type { SessionBudgetContext } from "#core/types/session-budget-context.js";
import { toTokenCount } from "#core/types/units.js";

const CONTEXT_WINDOW_DEFAULT = 128_000;
const RESERVED_RESPONSE_DEFAULT = 4_000;
const TEMPLATE_OVERHEAD_DEFAULT = 500;

function resolveBaseBudget(
  rulePack: RulePack,
  taskClass: TaskClass,
  config: BudgetConfig,
): TokenCount {
  if (rulePack.budgetOverride !== undefined) {
    return rulePack.budgetOverride;
  }
  const perTask = config.getBudgetForTaskClass(taskClass);
  return perTask ?? config.getMaxTokens();
}

export class BudgetAllocator implements IBudgetAllocator {
  constructor(private readonly config: BudgetConfig) {}

  allocate(
    rulePack: RulePack,
    taskClass: TaskClass,
    sessionContext?: SessionBudgetContext,
  ): TokenCount {
    const base = resolveBaseBudget(rulePack, taskClass, this.config);
    if (sessionContext?.conversationTokens === undefined) {
      return base;
    }
    const availableBudget = Math.max(
      0,
      CONTEXT_WINDOW_DEFAULT -
        RESERVED_RESPONSE_DEFAULT -
        Number(sessionContext.conversationTokens) -
        TEMPLATE_OVERHEAD_DEFAULT,
    );
    return toTokenCount(Math.min(Number(base), availableBudget));
  }
}
