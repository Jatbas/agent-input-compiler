// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RulePackResolver as IRulePackResolver } from "@jatbas/aic-shared/core/interfaces/rule-pack-resolver.interface.js";
import type { RulePackProvider } from "@jatbas/aic-shared/core/interfaces/rule-pack-provider.interface.js";
import type { TaskClassification } from "@jatbas/aic-shared/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-shared/core/types/rule-pack.js";
import type { AbsolutePath } from "@jatbas/aic-shared/core/types/paths.js";

function dedupe<T>(arr: readonly T[]): T[] {
  const seen = new Set<T>();
  return arr.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

function mergePacks(base: RulePack, overlay: RulePack): RulePack {
  const name = overlay.name ?? base.name;
  const version = overlay.version ?? base.version;
  const description = overlay.description ?? base.description;
  const budgetOverride = overlay.budgetOverride ?? base.budgetOverride;
  const heuristic = overlay.heuristic ?? base.heuristic;
  return {
    ...(name !== undefined ? { name } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(description !== undefined ? { description } : {}),
    constraints: dedupe([...base.constraints, ...overlay.constraints]),
    includePatterns: dedupe([...base.includePatterns, ...overlay.includePatterns]),
    excludePatterns: dedupe([...base.excludePatterns, ...overlay.excludePatterns]),
    ...(budgetOverride !== undefined ? { budgetOverride } : {}),
    ...(heuristic !== undefined ? { heuristic } : {}),
  };
}

export class RulePackResolver implements IRulePackResolver {
  constructor(private readonly rulePackProvider: RulePackProvider) {}

  resolve(task: TaskClassification, projectRoot: AbsolutePath): RulePack {
    const defaultPack = this.rulePackProvider.getBuiltInPack("built-in:default");
    const taskPack = this.rulePackProvider.getBuiltInPack(`built-in:${task.taskClass}`);
    const baseMerged = mergePacks(defaultPack, taskPack);
    const projectPack = this.rulePackProvider.getProjectPack(projectRoot, task.taskClass);
    return projectPack !== null ? mergePacks(baseMerged, projectPack) : baseMerged;
  }
}
