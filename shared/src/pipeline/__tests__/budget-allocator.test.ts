import { describe, it, expect } from "vitest";
import { BudgetAllocator } from "../budget-allocator.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import { TASK_CLASS } from "#core/types/enums.js";
import { toTokenCount } from "#core/types/units.js";

function makeConfig(
  maxTokens: number,
  perTaskClass: Record<string, number | null> = {},
): BudgetConfig {
  return {
    getMaxTokens: () => toTokenCount(maxTokens),
    getBudgetForTaskClass: (taskClass: string) => {
      const v = perTaskClass[taskClass];
      return v !== undefined && v !== null ? toTokenCount(v) : null;
    },
  };
}

describe("BudgetAllocator", () => {
  it("uses rulePack.budgetOverride when present", () => {
    const config = makeConfig(10000, { [TASK_CLASS.FEATURE]: 5000 });
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
      budgetOverride: toTokenCount(3000),
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE);
    expect(result).toBe(3000);
  });

  it("falls to config.getBudgetForTaskClass when no override", () => {
    const config = makeConfig(10000, { [TASK_CLASS.REFACTOR]: 6000 });
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.REFACTOR);
    expect(result).toBe(6000);
  });

  it("falls to config.getMaxTokens when perTaskClass returns null", () => {
    const config = makeConfig(12000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.DOCS);
    expect(result).toBe(12000);
  });

  it("returns config base value when getMaxTokens is the only source", () => {
    const config = makeConfig(8000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.GENERAL);
    expect(result).toBe(8000);
  });
});
