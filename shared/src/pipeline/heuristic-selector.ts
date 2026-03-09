// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContextSelector } from "@jatbas/aic-core/core/interfaces/context-selector.interface.js";
import type { ImportProximityScorer } from "@jatbas/aic-core/core/interfaces/import-proximity-scorer.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";
import type { FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type {
  HeuristicSelectorConfig,
  ScoringWeights,
} from "@jatbas/aic-core/core/interfaces/heuristic-selector-config.interface.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER, TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { matchesGlob } from "./glob-match.js";
import { minMaxNorm } from "./min-max-norm.js";
import { pathRelevance } from "./path-relevance.js";

const DEFAULT_WEIGHTS_BY_TASK_CLASS: Record<TaskClass, ScoringWeights> = {
  [TASK_CLASS.REFACTOR]: {
    pathRelevance: 0.2,
    importProximity: 0.36,
    symbolRelevance: 0.2,
    recency: 0.16,
    sizePenalty: 0.08,
  },
  [TASK_CLASS.BUGFIX]: {
    pathRelevance: 0.2,
    importProximity: 0.28,
    symbolRelevance: 0.2,
    recency: 0.24,
    sizePenalty: 0.08,
  },
  [TASK_CLASS.DOCS]: {
    pathRelevance: 0.4,
    importProximity: 0.16,
    symbolRelevance: 0.2,
    recency: 0.16,
    sizePenalty: 0.08,
  },
  [TASK_CLASS.FEATURE]: {
    pathRelevance: 0.32,
    importProximity: 0.24,
    symbolRelevance: 0.2,
    recency: 0.16,
    sizePenalty: 0.08,
  },
  [TASK_CLASS.TEST]: {
    pathRelevance: 0.32,
    importProximity: 0.24,
    symbolRelevance: 0.2,
    recency: 0.16,
    sizePenalty: 0.08,
  },
  [TASK_CLASS.GENERAL]: {
    pathRelevance: 0.32,
    importProximity: 0.24,
    symbolRelevance: 0.2,
    recency: 0.16,
    sizePenalty: 0.08,
  },
};

function filterCandidates(
  files: readonly FileEntry[],
  rulePack: RulePack,
): readonly FileEntry[] {
  return files.filter((f) => {
    if (
      rulePack.includePatterns.length > 0 &&
      !rulePack.includePatterns.some((pat) => matchesGlob(f.path, pat))
    )
      return false;
    if (rulePack.excludePatterns.some((pat) => matchesGlob(f.path, pat))) return false;
    return true;
  });
}

// One sort for all candidates; rank by first occurrence in sorted order (matches prior indexOf semantics).
function recencyRanksFromValues(recencyValues: readonly string[]): readonly number[] {
  if (recencyValues.length === 0) return [];
  const sortedRec = recencyValues.toSorted();
  const rankByVal = new Map<string, number>();
  const n = sortedRec.length;
  for (let i = 0; i < n; i++) {
    const v = sortedRec[i] ?? "";
    if (!rankByVal.has(v)) rankByVal.set(v, n <= 1 ? 1 : i / (n - 1));
  }
  return recencyValues.map((v) => rankByVal.get(v) ?? 0);
}

function scoreCandidate(
  entry: FileEntry,
  index: number,
  pathRelevances: readonly number[],
  recencyRanks: readonly number[],
  tokenValues: readonly number[],
  importProximityScores: ReadonlyMap<RelativePath, number>,
  symbolRelevanceScores: ReadonlyMap<RelativePath, number>,
  weights: ScoringWeights,
  rulePack: RulePack,
): number {
  const pathRel = pathRelevances[index] ?? 0;
  const rec = recencyRanks[index] ?? 0;
  const sizeP = 1 - minMaxNorm(tokenValues, tokenValues[index] ?? 0);
  const importProx = importProximityScores.get(entry.path) ?? 0;
  const symbolRel = symbolRelevanceScores.get(entry.path) ?? 0;
  const baseScore =
    pathRel * weights.pathRelevance +
    importProx * weights.importProximity +
    symbolRel * weights.symbolRelevance +
    rec * weights.recency +
    sizeP * weights.sizePenalty;
  const boostCount =
    rulePack.heuristic?.boostPatterns.filter((pat) => matchesGlob(entry.path, pat))
      .length ?? 0;
  const penaltyCount =
    rulePack.heuristic?.penalizePatterns.filter((pat) => matchesGlob(entry.path, pat))
      .length ?? 0;
  return Math.max(0, Math.min(1, baseScore + boostCount * 0.2 - penaltyCount * 0.2));
}

function fitToBudget(
  scored: readonly { entry: FileEntry; score: number }[],
  budget: TokenCount,
  maxFiles: number,
): { files: readonly SelectedFile[]; totalTokens: number } {
  return scored.reduce<{
    readonly files: readonly SelectedFile[];
    readonly totalTokens: number;
  }>(
    (acc, { entry, score }) => {
      if (acc.files.length >= maxFiles) return acc;
      const tokens = entry.estimatedTokens;
      if (acc.totalTokens + tokens > budget) return acc;
      return {
        files: [
          ...acc.files,
          {
            path: entry.path,
            language: entry.language,
            estimatedTokens: entry.estimatedTokens,
            relevanceScore: toRelevanceScore(score),
            tier: INCLUSION_TIER.L0,
          },
        ],
        totalTokens: acc.totalTokens + tokens,
      };
    },
    { files: [], totalTokens: 0 },
  );
}

export class HeuristicSelector implements ContextSelector {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly config: HeuristicSelectorConfig,
    private readonly importProximityScorer: ImportProximityScorer,
    private readonly symbolRelevanceScorer: ImportProximityScorer,
  ) {}

  async selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
  ): Promise<ContextResult> {
    const weights = this.config.weights ?? DEFAULT_WEIGHTS_BY_TASK_CLASS[task.taskClass];
    const importProximityScores = await this.importProximityScorer.getScores(repo, task);
    const symbolRelevanceScores = await this.symbolRelevanceScorer.getScores(repo, task);
    const candidates = filterCandidates(repo.files, rulePack);
    const pathRelevances = candidates.map((f) =>
      pathRelevance(f.path, task.matchedKeywords),
    );
    const recencyValues = candidates.map((f) => f.lastModified);
    const recencyRanks = recencyRanksFromValues(recencyValues);
    const tokenValues = candidates.map((f) => f.estimatedTokens);
    const scored = candidates.map((entry, i) => ({
      entry,
      score: scoreCandidate(
        entry,
        i,
        pathRelevances,
        recencyRanks,
        tokenValues,
        importProximityScores,
        symbolRelevanceScores,
        weights,
        rulePack,
      ),
    }));
    const sorted = scored.toSorted((a, b) => b.score - a.score);
    const { files, totalTokens: totalTokensNum } = fitToBudget(
      sorted,
      budget,
      this.config.maxFiles,
    );
    const truncated = files.length < candidates.length || totalTokensNum >= budget;
    return {
      files,
      totalTokens: toTokenCount(totalTokensNum),
      truncated,
    };
  }
}
