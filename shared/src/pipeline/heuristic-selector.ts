// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ImportProximityScorer } from "@jatbas/aic-core/core/interfaces/import-proximity-scorer.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type {
  HeuristicSelectorConfig,
  ScoringWeights,
} from "@jatbas/aic-core/core/interfaces/heuristic-selector-config.interface.js";
import type { FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type {
  ContextResult,
  ContextSelector,
  RelativePath,
  RepoMap,
  RulePack,
  TaskClassification,
  TokenCount,
  ToolOutput,
} from "./context-selector-shared-types.js";
import { INCLUSION_TIER, TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { type Confidence, toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import {
  EXCLUSION_REASON,
  type ExclusionReason,
} from "@jatbas/aic-core/core/types/selection-trace.js";
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

type TraceExcludedRow = {
  readonly path: RelativePath;
  readonly score: number;
  readonly reason: ExclusionReason;
};

type ScoreSignals = NonNullable<SelectedFile["scoreSignals"]>;

type ScoredCandidate = {
  readonly entry: FileEntry;
  readonly score: number;
  readonly signals: ScoreSignals;
};

function partitionCandidatesByRules(
  files: readonly FileEntry[],
  rulePack: RulePack,
): {
  readonly candidates: readonly FileEntry[];
  readonly traceExcluded: readonly TraceExcludedRow[];
} {
  return files.reduce<{
    readonly candidates: readonly FileEntry[];
    readonly traceExcluded: readonly TraceExcludedRow[];
  }>(
    (acc, f) => {
      if (
        rulePack.includePatterns.length > 0 &&
        !rulePack.includePatterns.some((pat) => matchesGlob(f.path, pat))
      ) {
        return {
          candidates: acc.candidates,
          traceExcluded: [
            ...acc.traceExcluded,
            {
              path: f.path,
              score: 0,
              reason: EXCLUSION_REASON.INCLUDE_PATTERN_MISMATCH,
            },
          ],
        };
      }
      if (rulePack.excludePatterns.some((pat) => matchesGlob(f.path, pat))) {
        return {
          candidates: acc.candidates,
          traceExcluded: [
            ...acc.traceExcluded,
            {
              path: f.path,
              score: 0,
              reason: EXCLUSION_REASON.EXCLUDE_PATTERN_MATCH,
            },
          ],
        };
      }
      return {
        candidates: [...acc.candidates, f],
        traceExcluded: acc.traceExcluded,
      };
    },
    { candidates: [], traceExcluded: [] },
  );
}

function partitionZeroSemanticSignal(scored: readonly ScoredCandidate[]): {
  readonly eligible: readonly ScoredCandidate[];
  readonly traceExcluded: readonly TraceExcludedRow[];
} {
  return scored.reduce<{
    readonly eligible: readonly ScoredCandidate[];
    readonly traceExcluded: readonly TraceExcludedRow[];
  }>(
    (acc, item) => {
      const semanticSum =
        item.signals.pathRelevance +
        item.signals.importProximity +
        item.signals.symbolRelevance +
        item.signals.ruleBoostCount;
      if (semanticSum === 0) {
        return {
          eligible: acc.eligible,
          traceExcluded: [
            ...acc.traceExcluded,
            {
              path: item.entry.path,
              score: item.score,
              reason: EXCLUSION_REASON.ZERO_SEMANTIC_SIGNAL,
            },
          ],
        };
      }
      return {
        eligible: [...acc.eligible, item],
        traceExcluded: acc.traceExcluded,
      };
    },
    { eligible: [], traceExcluded: [] },
  );
}

function recencyRanksFromValues(recencyValues: readonly string[]): readonly number[] {
  if (recencyValues.length === 0) return [];
  const sortedRec = recencyValues.toSorted();
  const rankByVal = new Map<string, number>();
  const n = sortedRec.length;
  sortedRec.forEach((v, i) => {
    if (!rankByVal.has(v)) rankByVal.set(v, n <= 1 ? 1 : i / (n - 1));
  });
  return recencyValues.map((v) => rankByVal.get(v) ?? 0);
}

function scoreAndSignalsForCandidate(
  entry: FileEntry,
  index: number,
  pathRelevances: readonly number[],
  recencyRanks: readonly number[],
  tokenValues: readonly number[],
  importProximityScores: ReadonlyMap<RelativePath, number>,
  symbolRelevanceScores: ReadonlyMap<RelativePath, number>,
  weights: ScoringWeights,
  rulePack: RulePack,
  confidence: Confidence,
): { readonly score: number; readonly signals: ScoreSignals } {
  const pathRel = pathRelevances[index] ?? 0;
  const rec = recencyRanks[index] ?? 0;
  const sizeP = 1 - minMaxNorm(tokenValues, tokenValues[index] ?? 0);
  const importProx = importProximityScores.get(entry.path) ?? 0;
  const symbolRel = symbolRelevanceScores.get(entry.path) ?? 0;
  const recencyWeightFactor = Number(confidence) < 0.5 ? 0.5 : 1;
  const baseScore =
    pathRel * weights.pathRelevance +
    importProx * weights.importProximity +
    symbolRel * weights.symbolRelevance +
    rec * weights.recency * recencyWeightFactor +
    sizeP * weights.sizePenalty;
  const boostCount =
    rulePack.heuristic?.boostPatterns.filter((pat) => matchesGlob(entry.path, pat))
      .length ?? 0;
  const penaltyCount =
    rulePack.heuristic?.penalizePatterns.filter((pat) => matchesGlob(entry.path, pat))
      .length ?? 0;
  const score = Math.max(
    0,
    Math.min(1, baseScore + boostCount * 0.2 - penaltyCount * 0.2),
  );
  return {
    score,
    signals: {
      pathRelevance: pathRel,
      importProximity: importProx,
      symbolRelevance: symbolRel,
      recency: rec,
      sizePenalty: sizeP,
      ruleBoostCount: boostCount,
      rulePenaltyCount: penaltyCount,
    },
  };
}

type BudgetFitAcc = {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: number;
  readonly traceExcluded: readonly TraceExcludedRow[];
};

function reduceFitStep(
  acc: BudgetFitAcc,
  item: ScoredCandidate,
  maxFiles: number,
  budgetNum: number,
): BudgetFitAcc {
  if (acc.files.length >= maxFiles) {
    return {
      files: acc.files,
      totalTokens: acc.totalTokens,
      traceExcluded: [
        ...acc.traceExcluded,
        {
          path: item.entry.path,
          score: item.score,
          reason: EXCLUSION_REASON.MAX_FILES,
        },
      ],
    };
  }
  const tokens = item.entry.estimatedTokens;
  if (acc.totalTokens + Number(tokens) > budgetNum) {
    return {
      files: acc.files,
      totalTokens: acc.totalTokens,
      traceExcluded: [
        ...acc.traceExcluded,
        {
          path: item.entry.path,
          score: item.score,
          reason: EXCLUSION_REASON.BUDGET_EXCEEDED,
        },
      ],
    };
  }
  return {
    files: [
      ...acc.files,
      {
        path: item.entry.path,
        language: item.entry.language,
        estimatedTokens: item.entry.estimatedTokens,
        relevanceScore: toRelevanceScore(item.score),
        tier: INCLUSION_TIER.L0,
        scoreSignals: item.signals,
      },
    ],
    totalTokens: acc.totalTokens + Number(tokens),
    traceExcluded: acc.traceExcluded,
  };
}

function fitToBudgetWithTrace(
  sorted: readonly ScoredCandidate[],
  budget: TokenCount,
  maxFiles: number,
): {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: number;
  readonly traceExcluded: readonly TraceExcludedRow[];
} {
  const budgetNum = Number(budget);
  const initial: BudgetFitAcc = { files: [], totalTokens: 0, traceExcluded: [] };
  return sorted.reduce<BudgetFitAcc>(
    (acc, item) => reduceFitStep(acc, item, maxFiles, budgetNum),
    initial,
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
    _toolOutputs?: readonly ToolOutput[],
  ): Promise<ContextResult> {
    const weights = this.config.weights ?? DEFAULT_WEIGHTS_BY_TASK_CLASS[task.taskClass];
    const importProximityScores = await this.importProximityScorer.getScores(repo, task);
    const symbolRelevanceScores = await this.symbolRelevanceScorer.getScores(repo, task);
    const { candidates, traceExcluded: ruleTraceExcluded } = partitionCandidatesByRules(
      repo.files,
      rulePack,
    );
    const pathRelevances = candidates.map((f) =>
      pathRelevance(f.path, task.matchedKeywords),
    );
    const recencyValues = candidates.map((f) => f.lastModified);
    const recencyRanks = recencyRanksFromValues(recencyValues);
    const tokenValues = candidates.map((f) => f.estimatedTokens);
    const scored = candidates.map((entry, i) => {
      const { score, signals } = scoreAndSignalsForCandidate(
        entry,
        i,
        pathRelevances,
        recencyRanks,
        tokenValues,
        importProximityScores,
        symbolRelevanceScores,
        weights,
        rulePack,
        task.confidence,
      );
      return { entry, score, signals };
    });
    const { eligible, traceExcluded: zeroSemanticTraceExcluded } =
      partitionZeroSemanticSignal(scored);
    const sorted = eligible.toSorted(
      (a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path),
    );
    const maxFiles = rulePack.maxFilesOverride ?? this.config.maxFiles;
    const budgetNum = Number(budget);
    const {
      files,
      totalTokens: totalTokensNum,
      traceExcluded: budgetTraceExcluded,
    } = fitToBudgetWithTrace(sorted, budget, maxFiles);
    const traceExcludedFiles = [
      ...ruleTraceExcluded,
      ...zeroSemanticTraceExcluded,
      ...budgetTraceExcluded,
    ];
    const truncated = files.length < candidates.length || totalTokensNum >= budgetNum;
    return {
      files,
      totalTokens: toTokenCount(totalTokensNum),
      truncated,
      traceExcludedFiles,
    };
  }
}
