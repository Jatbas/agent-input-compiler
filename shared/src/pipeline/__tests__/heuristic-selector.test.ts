// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { HeuristicSelector } from "../heuristic-selector.js";
import type { ImportProximityScorer } from "@jatbas/aic-core/core/interfaces/import-proximity-scorer.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toGlobPattern } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { EXCLUSION_REASON } from "@jatbas/aic-core/core/types/selection-trace.js";

function makeRepo(
  files: { path: string; tokens: number; lastModified: string }[],
): RepoMap {
  const fileEntries = files.map((f) => ({
    path: toRelativePath(f.path),
    language: "ts",
    sizeBytes: toBytes(100),
    estimatedTokens: toTokenCount(f.tokens),
    lastModified: toISOTimestamp(f.lastModified),
  }));
  const totalTokens = files.reduce((s, f) => s + f.tokens, 0);
  return {
    root: toAbsolutePath("/proj"),
    files: fileEntries,
    totalFiles: fileEntries.length,
    totalTokens: toTokenCount(totalTokens),
  };
}

describe("HeuristicSelector", () => {
  const noProviders: readonly LanguageProvider[] = [];
  const stubScorer: ImportProximityScorer = {
    getScores: () => Promise.resolve(new Map()),
  };

  it("produces expected scores for known inputs (path relevance and size penalty)", async () => {
    const repo = makeRepo([
      {
        path: "src/refactor/service.ts",
        tokens: 100,
        lastModified: "2024-01-01T00:00:00.000Z",
      },
      { path: "other/util.ts", tokens: 500, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.REFACTOR,
      confidence: toConfidence(0.8),
      matchedKeywords: ["refactor"],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.length).toBeGreaterThanOrEqual(1);
    expect(result.files[0]?.path).toBe(toRelativePath("src/refactor/service.ts"));
    expect(result.totalTokens).toBe(600);
  });

  it("respects maxFiles cap", async () => {
    const repo = makeRepo(
      Array.from({ length: 30 }, (_, i) => ({
        path: `src/f${i}.ts`,
        tokens: 10,
        lastModified: "2024-01-01T00:00:00.000Z",
      })),
    );
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 5 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(
      task,
      repo,
      toTokenCount(10000),
      rulePack,
    );
    expect(result.files.length).toBe(5);
  });

  it("maxfiles_override_from_rulepack_takes_precedence", async () => {
    const repo = makeRepo(
      Array.from({ length: 10 }, (_, i) => ({
        path: `src/n${i}.ts`,
        tokens: 5,
        lastModified: "2024-01-01T00:00:00.000Z",
      })),
    );
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
      maxFilesOverride: 3,
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(
      task,
      repo,
      toTokenCount(10000),
      rulePack,
    );
    expect(result.files.length).toBe(3);
  });

  it("filters by includePatterns whitelist", async () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "lib/b.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [toGlobPattern("src/**")],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.map((f) => f.path)).toEqual([toRelativePath("src/a.ts")]);
  });

  it("filters by excludePatterns blacklist", async () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "src/ignore/b.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [toGlobPattern("src/ignore/**")],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.map((f) => f.path)).toEqual([toRelativePath("src/a.ts")]);
  });

  it("applies boostPatterns +0.2 and penalizePatterns -0.2 (clamped)", async () => {
    const repo = makeRepo([
      { path: "boost/me.ts", tokens: 50, lastModified: "2024-01-02T00:00:00.000Z" },
      { path: "penalize/me.ts", tokens: 50, lastModified: "2024-01-02T00:00:00.000Z" },
      { path: "neutral.ts", tokens: 50, lastModified: "2024-01-02T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
      heuristic: {
        boostPatterns: [toGlobPattern("boost/**")],
        penalizePatterns: [toGlobPattern("penalize/**")],
      },
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.length).toBe(3);
    const boostFile = result.files.find((f) => (f.path as string).includes("boost"));
    const penalizeFile = result.files.find((f) =>
      (f.path as string).includes("penalize"),
    );
    expect(boostFile).toBeDefined();
    expect(penalizeFile).toBeDefined();
    expect(
      (boostFile!.relevanceScore as number) >= (penalizeFile!.relevanceScore as number),
    ).toBe(true);
  });

  it("stops adding files when budget exceeded", async () => {
    const repo = makeRepo([
      { path: "a.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "b.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "c.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(task, repo, toTokenCount(500), rulePack);
    expect(result.files.length).toBe(1);
    expect(result.totalTokens).toBe(400);
  });

  it("uses importProximity 0 when no LanguageProvider (all files get 0)", async () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(task, repo, toTokenCount(1000), rulePack);
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.relevanceScore).toBeDefined();
  });

  it("import_proximity_increases_score_when_scorer_returns_non_zero", async () => {
    const repo = makeRepo([
      { path: "seed.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "other.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0.5),
      matchedKeywords: ["seed"],
      subjectTokens: [],
    };
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const zeroScorer: ImportProximityScorer = {
      getScores: () => Promise.resolve(new Map()),
    };
    const selectorZero = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      zeroScorer,
      zeroScorer,
    );
    const resultZero = await selectorZero.selectContext(
      task,
      repo,
      toTokenCount(1000),
      rulePack,
    );
    const otherScoreZero =
      resultZero.files.find((f) => f.path === toRelativePath("other.ts"))
        ?.relevanceScore ?? 0;
    const nonZeroScorer: ImportProximityScorer = {
      getScores: () => Promise.resolve(new Map([[toRelativePath("other.ts"), 0.6]])),
    };
    const selectorNonZero = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      nonZeroScorer,
      nonZeroScorer,
    );
    const resultNonZero = await selectorNonZero.selectContext(
      task,
      repo,
      toTokenCount(1000),
      rulePack,
    );
    const otherScoreNonZero =
      resultNonZero.files.find((f) => f.path === toRelativePath("other.ts"))
        ?.relevanceScore ?? 0;
    expect(otherScoreNonZero).toBeGreaterThan(otherScoreZero);
  });

  it("refactor_uses_higher_import_proximity_weight", async () => {
    const repo = makeRepo([
      { path: "seed.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "other.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const importHeavyScorer: ImportProximityScorer = {
      getScores: () => Promise.resolve(new Map([[toRelativePath("other.ts"), 0.8]])),
    };
    const zeroScorerRefactor: ImportProximityScorer = {
      getScores: () => Promise.resolve(new Map()),
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      importHeavyScorer,
      zeroScorerRefactor,
    );
    const refactorResult = await selector.selectContext(
      {
        taskClass: TASK_CLASS.REFACTOR,
        confidence: toConfidence(0.8),
        matchedKeywords: ["refactor"],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    const generalResult = await selector.selectContext(
      {
        taskClass: TASK_CLASS.GENERAL,
        confidence: toConfidence(0.5),
        matchedKeywords: ["seed"],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    expect(refactorResult.files[0]?.path).toBe(toRelativePath("other.ts"));
    expect(generalResult.files[0]?.path).toBe(toRelativePath("seed.ts"));
  });

  it("bugfix_uses_higher_recency_and_import_weights", async () => {
    const repo = makeRepo([
      { path: "newer.ts", tokens: 100, lastModified: "2024-01-02T00:00:00.000Z" },
      { path: "older.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const importOnOlderScorer: ImportProximityScorer = {
      getScores: () => Promise.resolve(new Map([[toRelativePath("older.ts"), 0.8]])),
    };
    const zeroScorerBugfix: ImportProximityScorer = {
      getScores: () => Promise.resolve(new Map()),
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      importOnOlderScorer,
      zeroScorerBugfix,
    );
    const bugfixResult = await selector.selectContext(
      {
        taskClass: TASK_CLASS.BUGFIX,
        confidence: toConfidence(0.8),
        matchedKeywords: [],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    const generalResult = await selector.selectContext(
      {
        taskClass: TASK_CLASS.GENERAL,
        confidence: toConfidence(0),
        matchedKeywords: [],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    expect(bugfixResult.files[0]?.path).toBe(toRelativePath("newer.ts"));
    expect(generalResult.files[0]?.path).toBe(toRelativePath("older.ts"));
  });

  it("docs_uses_higher_path_relevance_weight", async () => {
    const repo = makeRepo([
      { path: "readme.md", tokens: 500, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "src/util.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const docsResult = await selector.selectContext(
      {
        taskClass: TASK_CLASS.DOCS,
        confidence: toConfidence(0.8),
        matchedKeywords: ["readme"],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    const generalResult = await selector.selectContext(
      {
        taskClass: TASK_CLASS.GENERAL,
        confidence: toConfidence(0),
        matchedKeywords: [],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    expect(docsResult.files[0]?.path).toBe(toRelativePath("readme.md"));
    expect(generalResult.files[0]?.path).toBe(toRelativePath("src/util.ts"));
  });

  it("heuristic_selector_populates_trace_exclusions", async () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "lib/b.ts", tokens: 50, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.GENERAL,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const includeRulePack: RulePack = {
      constraints: [],
      includePatterns: [toGlobPattern("src/**")],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const includeResult = await selector.selectContext(
      task,
      repo,
      toTokenCount(1000),
      includeRulePack,
    );
    const libExcluded = includeResult.traceExcludedFiles.find(
      (r) => r.path === toRelativePath("lib/b.ts"),
    );
    expect(libExcluded?.reason).toBe(EXCLUSION_REASON.INCLUDE_PATTERN_MISMATCH);

    const budgetRepo = makeRepo([
      { path: "a.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "b.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "c.ts", tokens: 400, lastModified: "2024-01-01T00:00:00.000Z" },
    ]);
    const budgetPack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const budgetResult = await selector.selectContext(
      task,
      budgetRepo,
      toTokenCount(500),
      budgetPack,
    );
    expect(
      budgetResult.traceExcludedFiles.some(
        (r) => r.reason === EXCLUSION_REASON.BUDGET_EXCEEDED,
      ),
    ).toBe(true);
  });

  it("config_weights_override_per_task_defaults", async () => {
    const repo = makeRepo([
      { path: "old.ts", tokens: 100, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "new.ts", tokens: 100, lastModified: "2024-01-02T00:00:00.000Z" },
    ]);
    const rulePack: RulePack = {
      constraints: [],
      includePatterns: [],
      excludePatterns: [],
    };
    const selector = new HeuristicSelector(
      noProviders,
      {
        maxFiles: 20,
        weights: {
          pathRelevance: 0.1,
          importProximity: 0.1,
          symbolRelevance: 0,
          recency: 0.7,
          sizePenalty: 0.1,
        },
      },
      stubScorer,
      stubScorer,
    );
    const result = await selector.selectContext(
      {
        taskClass: TASK_CLASS.REFACTOR,
        confidence: toConfidence(0.8),
        matchedKeywords: [],
        subjectTokens: [],
      },
      repo,
      toTokenCount(1000),
      rulePack,
    );
    expect(result.files[0]?.path).toBe(toRelativePath("new.ts"));
  });
});
