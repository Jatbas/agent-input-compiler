// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { BudgetAllocator as IBudgetAllocator } from "@jatbas/aic-core/core/interfaces/budget-allocator.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { SessionBudgetContext } from "@jatbas/aic-core/core/types/session-budget-context.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

export const CONTEXT_WINDOW_DEFAULT = 128_000;
export const RESERVED_RESPONSE_DEFAULT = 4_000;
export const TEMPLATE_OVERHEAD_DEFAULT = 500;

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
    const conversationTokens = Number(sessionContext?.conversationTokens ?? 0);
    if (Number(base) === 0) {
      const headroom = Math.max(
        0,
        CONTEXT_WINDOW_DEFAULT -
          RESERVED_RESPONSE_DEFAULT -
          conversationTokens -
          TEMPLATE_OVERHEAD_DEFAULT,
      );
      return toTokenCount(headroom);
    }
    if (sessionContext?.conversationTokens === undefined) {
      return base;
    }
    const availableBudget = Math.max(
      0,
      CONTEXT_WINDOW_DEFAULT -
        RESERVED_RESPONSE_DEFAULT -
        conversationTokens -
        TEMPLATE_OVERHEAD_DEFAULT,
    );
    return toTokenCount(Math.min(Number(base), availableBudget));
  }
}
