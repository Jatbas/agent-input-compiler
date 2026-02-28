import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RelativePath } from "#core/types/paths.js";

export interface ImportProximityScorer {
  getScores(repo: RepoMap, task: TaskClassification): ReadonlyMap<RelativePath, number>;
}
