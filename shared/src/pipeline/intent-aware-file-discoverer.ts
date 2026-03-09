// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { IntentAwareFileDiscoverer as IIntentAwareFileDiscoverer } from "@jatbas/aic-core/core/interfaces/intent-aware-file-discoverer.interface.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { matchesGlob } from "./glob-match.js";

function excluded(path: string, excludePatterns: readonly string[]): boolean {
  return excludePatterns.some((p) => matchesGlob(path, p));
}

function passesInclude(path: string, includePatterns: readonly string[]): boolean {
  return includePatterns.some((p) => matchesGlob(path, p));
}

function pathContainsKeyword(path: string, keywords: readonly string[]): boolean {
  const lower = path.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function applyIncludeOrKeywordFilter(
  afterExclude: readonly RepoMap["files"][number][],
  task: TaskClassification,
  rulePack: RulePack,
): readonly RepoMap["files"][number][] {
  if (rulePack.includePatterns.length > 0)
    return afterExclude.filter((f) => passesInclude(f.path, rulePack.includePatterns));
  if (task.matchedKeywords.length > 0)
    return afterExclude.filter((f) => pathContainsKeyword(f.path, task.matchedKeywords));
  return afterExclude;
}

export class IntentAwareFileDiscoverer implements IIntentAwareFileDiscoverer {
  constructor() {}

  discover(repo: RepoMap, task: TaskClassification, rulePack: RulePack): RepoMap {
    const afterExclude = repo.files.filter(
      (f) => !excluded(f.path, rulePack.excludePatterns),
    );
    const filtered = applyIncludeOrKeywordFilter(afterExclude, task, rulePack);
    if (filtered.length === 0) return repo;
    const totalTokens: TokenCount = toTokenCount(
      filtered.reduce((sum, f) => sum + f.estimatedTokens, 0),
    );
    return {
      root: repo.root,
      files: filtered,
      totalFiles: filtered.length,
      totalTokens,
    };
  }
}
