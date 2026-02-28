import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";

export interface IntentAwareFileDiscoverer {
  discover(repo: RepoMap, task: TaskClassification, rulePack: RulePack): RepoMap;
}
