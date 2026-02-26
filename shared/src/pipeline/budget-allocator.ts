import type { BudgetAllocator as IBudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";
export class BudgetAllocator implements IBudgetAllocator {
  constructor(private readonly config: BudgetConfig) {}

  allocate(rulePack: RulePack, taskClass: TaskClass): TokenCount {
    if (rulePack.budgetOverride !== undefined) {
      return rulePack.budgetOverride;
    }
    const perTask = this.config.getBudgetForTaskClass(taskClass);
    if (perTask !== null) {
      return perTask;
    }
    return this.config.getMaxTokens();
  }
}
