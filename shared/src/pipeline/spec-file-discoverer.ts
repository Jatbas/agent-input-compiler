// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SpecFileDiscoverer as ISpecFileDiscoverer } from "@jatbas/aic-core/core/interfaces/spec-file-discoverer.interface.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { matchesGlob } from "./glob-match.js";
import { minMaxNorm } from "./min-max-norm.js";
import { pathRelevance } from "./path-relevance.js";

const SPEC_PATH_TIERS: readonly {
  readonly matches: (p: string) => boolean;
  readonly score: number;
}[] = [
  {
    matches: (p) => p.startsWith("documentation/adr") || p.startsWith("adr-"),
    score: 1.0,
  },
  { matches: (p) => p.startsWith("documentation/"), score: 0.8 },
  { matches: (p) => p.startsWith(".cursor/rules/"), score: 0.7 },
  { matches: (p) => p.startsWith(".claude/skills/"), score: 0.6 },
];

const PATH_TIER_WEIGHT = 0.4;
const KEYWORD_WEIGHT = 0.3;
const RECENCY_WEIGHT = 0.2;
const SIZE_PENALTY_WEIGHT = 0.1;
const BOOST_DELTA = 0.2;
const PENALIZE_DELTA = 0.2;

function recencyScoresFromValues(
  lastModifiedValues: readonly string[],
): readonly number[] {
  if (lastModifiedValues.length === 0) return [];
  const sorted = lastModifiedValues.toSorted();
  const n = sorted.length;
  const rankByVal = new Map<string, number>();
  sorted.forEach((v, i) => {
    if (!rankByVal.has(v)) rankByVal.set(v, n <= 1 ? 1 : i / (n - 1));
  });
  return lastModifiedValues.map((v) => rankByVal.get(v) ?? 0);
}

function pathTierScore(path: string): number {
  const tier = SPEC_PATH_TIERS.find((t) => t.matches(path));
  return tier?.score ?? 0.5;
}

function filterCandidates(
  files: readonly FileEntry[],
  task: TaskClassification,
  rulePack: RulePack,
): readonly FileEntry[] {
  const afterExclude = files.filter(
    (f) => !rulePack.excludePatterns.some((pat) => matchesGlob(f.path, pat)),
  );
  if (rulePack.includePatterns.length > 0) {
    return afterExclude.filter((f) =>
      rulePack.includePatterns.some((pat) => matchesGlob(f.path, pat)),
    );
  }
  if (task.matchedKeywords.length > 0) {
    const lowerKeywords = task.matchedKeywords.map((k) => k.toLowerCase());
    return afterExclude.filter((f) =>
      lowerKeywords.some((kw) => f.path.toLowerCase().includes(kw)),
    );
  }
  return afterExclude;
}

function scoreEntry(
  entry: FileEntry,
  index: number,
  pathTiers: readonly number[],
  keywordScores: readonly number[],
  recencyScores: readonly number[],
  sizePenalties: readonly number[],
  rulePack: RulePack,
): number {
  const base =
    (pathTiers[index] ?? 0) * PATH_TIER_WEIGHT +
    (keywordScores[index] ?? 0) * KEYWORD_WEIGHT +
    (recencyScores[index] ?? 0) * RECENCY_WEIGHT +
    (sizePenalties[index] ?? 0) * SIZE_PENALTY_WEIGHT;
  const boostCount =
    rulePack.heuristic?.boostPatterns.filter((pat) => matchesGlob(entry.path, pat))
      .length ?? 0;
  const penalizeCount =
    rulePack.heuristic?.penalizePatterns.filter((pat) => matchesGlob(entry.path, pat))
      .length ?? 0;
  return Math.max(
    0,
    Math.min(1, base + boostCount * BOOST_DELTA - penalizeCount * PENALIZE_DELTA),
  );
}

export class SpecFileDiscoverer implements ISpecFileDiscoverer {
  constructor() {}

  discover(
    specRepoMap: RepoMap,
    task: TaskClassification,
    rulePack: RulePack,
  ): ContextResult {
    const candidates = filterCandidates(specRepoMap.files, task, rulePack);
    const pathTiers = candidates.map((e) => pathTierScore(e.path));
    const keywordScores = candidates.map((e) =>
      pathRelevance(e.path, task.matchedKeywords),
    );
    const lastMods = candidates.map((e) => e.lastModified);
    const recencyScores = recencyScoresFromValues(lastMods);
    const tokenNums = candidates.map((e) => e.estimatedTokens);
    const sizePenalties = candidates.map(
      (e, i) => 1 - minMaxNorm(tokenNums, tokenNums[i] ?? 0),
    );
    const scored = candidates.map((entry, i) => ({
      entry,
      score: scoreEntry(
        entry,
        i,
        pathTiers,
        keywordScores,
        recencyScores,
        sizePenalties,
        rulePack,
      ),
    }));
    const sorted = scored.toSorted((a, b) => b.score - a.score);
    const files: readonly SelectedFile[] = sorted.map(
      ({ entry, score }): SelectedFile => ({
        path: entry.path,
        language: entry.language,
        estimatedTokens: entry.estimatedTokens,
        relevanceScore: toRelevanceScore(score),
        tier: INCLUSION_TIER.L0,
      }),
    );
    const totalTokensNum = files.reduce((sum, f) => sum + f.estimatedTokens, 0);
    return {
      files,
      totalTokens: toTokenCount(totalTokensNum),
      truncated: false,
    };
  }
}
