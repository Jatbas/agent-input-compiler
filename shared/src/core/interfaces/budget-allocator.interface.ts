import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";

export interface BudgetAllocator {
  allocate(rulePack: RulePack, taskClass: TaskClass): TokenCount;
}
