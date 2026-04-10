// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { BudgetAllocator } from "../budget-allocator.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

function makeConfig(
  maxTokens: number,
  perTaskClass: Record<string, number | null> = {},
  contextWindow: number | null = null,
): BudgetConfig {
  return {
    getMaxTokens: () => toTokenCount(maxTokens),
    getBudgetForTaskClass: (taskClass: string) => {
      const v = perTaskClass[taskClass];
      return v !== undefined && v !== null ? toTokenCount(v) : null;
    },
    getContextWindow: () => (contextWindow !== null ? toTokenCount(contextWindow) : null),
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

  it("session_cap_applied_when_conversation_tokens_provided", () => {
    const config = makeConfig(10000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE, {
      conversationTokens: toTokenCount(115_000),
    });
    expect(result).toBe(8500);
  });

  it("cap_does_not_exceed_base_budget", () => {
    const config = makeConfig(10000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE, {
      conversationTokens: toTokenCount(1000),
    });
    expect(result).toBe(10000);
  });

  it("available_budget_clamped_non_negative", () => {
    const config = makeConfig(10000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE, {
      conversationTokens: toTokenCount(200_000),
    });
    expect(result).toBe(toTokenCount(0));
  });

  it("auto_mode_returns_headroom_when_no_session", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.GENERAL);
    expect(result).toBe(toTokenCount(123_500));
  });

  it("auto_mode_subtracts_conversation_tokens", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE, {
      conversationTokens: toTokenCount(100_000),
    });
    expect(result).toBe(toTokenCount(23_500));
  });

  it("auto_mode_clamps_headroom_to_zero", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE, {
      conversationTokens: toTokenCount(200_000),
    });
    expect(result).toBe(toTokenCount(0));
  });

  it("auto_mode_with_budget_override_uses_override", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
      budgetOverride: toTokenCount(5000),
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE);
    expect(result).toBe(toTokenCount(5000));
  });

  it("explicit_maxTokens_preserves_manual_behavior", () => {
    const config = makeConfig(8000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.GENERAL);
    expect(result).toBe(toTokenCount(8000));
  });

  it("model_window_from_sessionContext_used_when_base_zero", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.GENERAL, {
      contextWindow: toTokenCount(200_000),
    });
    expect(result).toBe(toTokenCount(195_500));
  });

  it("user_config_window_overrides_session_contextWindow", () => {
    const config = makeConfig(0, {}, 300_000);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.GENERAL, {
      contextWindow: toTokenCount(200_000),
    });
    expect(result).toBe(toTokenCount(295_500));
  });

  it("default_128k_used_when_no_model_and_no_config_window", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.GENERAL);
    expect(result).toBe(toTokenCount(123_500));
  });

  it("model_window_caps_base_budget_correctly", () => {
    const config = makeConfig(0);
    const allocator = new BudgetAllocator(config);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const result = allocator.allocate(rulePack, TASK_CLASS.FEATURE, {
      conversationTokens: toTokenCount(100_000),
      contextWindow: toTokenCount(130_000),
    });
    expect(result).toBe(toTokenCount(25_500));
  });
});
