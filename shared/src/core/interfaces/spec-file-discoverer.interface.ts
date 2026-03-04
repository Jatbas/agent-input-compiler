import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { ContextResult } from "#core/types/selected-file.js";

export interface SpecFileDiscoverer {
  discover(
    specRepoMap: RepoMap,
    task: TaskClassification,
    rulePack: RulePack,
  ): ContextResult;
}
