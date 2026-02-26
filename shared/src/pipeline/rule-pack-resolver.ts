import type { RulePackResolver as IRulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";

function dedupe<T>(arr: readonly T[]): T[] {
  const seen = new Set<T>();
  return arr.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

function mergePacks(base: RulePack, overlay: RulePack): RulePack {
  return {
    name: overlay.name ?? base.name,
    version: overlay.version ?? base.version,
    description: overlay.description ?? base.description,
    constraints: dedupe([...base.constraints, ...overlay.constraints]),
    includePatterns: dedupe([...base.includePatterns, ...overlay.includePatterns]),
    excludePatterns: dedupe([...base.excludePatterns, ...overlay.excludePatterns]),
    budgetOverride: overlay.budgetOverride ?? base.budgetOverride,
    heuristic: overlay.heuristic ?? base.heuristic,
  };
}

export class RulePackResolver implements IRulePackResolver {
  constructor(private readonly rulePackProvider: RulePackProvider) {}

  resolve(task: TaskClassification, projectRoot: AbsolutePath): RulePack {
    const defaultPack = this.rulePackProvider.getBuiltInPack("built-in:default");
    const taskPack = this.rulePackProvider.getBuiltInPack(`built-in:${task.taskClass}`);
    let merged = mergePacks(defaultPack, taskPack);
    const projectPack = this.rulePackProvider.getProjectPack(projectRoot, task.taskClass);
    if (projectPack !== null) {
      merged = mergePacks(merged, projectPack);
    }
    return merged;
  }
}
