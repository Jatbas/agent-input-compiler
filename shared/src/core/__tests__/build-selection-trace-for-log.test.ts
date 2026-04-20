// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { buildSelectionTraceForLog } from "../build-selection-trace-for-log.js";
import type { PipelineStepsResult } from "../run-pipeline-steps.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { ContextResult } from "@jatbas/aic-core/core/types/selected-file.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import type { TransformResult } from "@jatbas/aic-core/core/types/transform-types.js";
import { toAbsolutePath, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toConfidence, toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { TASK_CLASS, INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import {
  EXCLUSION_REASON,
  type SelectionTraceExcludedRow,
} from "@jatbas/aic-core/core/types/selection-trace.js";

function stubPipelineResult(
  overrides: Partial<{
    readonly contextExcluded: readonly SelectionTraceExcludedRow[];
    readonly selectedPaths: readonly string[];
    readonly safePaths: readonly string[];
    readonly prunedPaths: readonly string[];
    readonly omitPrunedScoreSignals: boolean;
  }> = {},
): PipelineStepsResult {
  const selectedPaths = overrides.selectedPaths ?? ["src/in.ts", "src/out.ts"];
  const safePaths = overrides.safePaths ?? ["src/in.ts"];
  const prunedPaths = overrides.prunedPaths ?? ["src/in.ts"];
  const task: TaskClassification = {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(1),
    matchedKeywords: [],
    subjectTokens: [],
    specificityScore: toConfidence(0),
    underspecificationIndex: toConfidence(0),
  };
  const rulePack: RulePack = {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
  };
  const repoMap: RepoMap = {
    root: toAbsolutePath("/p"),
    files: [],
    totalFiles: 0,
    totalTokens: toTokenCount(0),
  };
  const contextResult: ContextResult = {
    files: [],
    totalTokens: toTokenCount(0),
    truncated: false,
    traceExcludedFiles: [...(overrides.contextExcluded ?? [])],
  };
  const guardResult: GuardResult = {
    passed: true,
    findings: [],
    filesBlocked: [],
    filesRedacted: [],
    filesWarned: [],
  };
  const transformResult: TransformResult = { files: [], metadata: [] };
  const mk = (path: string) => ({
    path: toRelativePath(path),
    language: "ts",
    estimatedTokens: toTokenCount(10),
    relevanceScore: toRelevanceScore(0.5),
    tier: INCLUSION_TIER.L0,
  });
  return {
    task,
    rulePack,
    budget: toTokenCount(1000),
    codeBudget: toTokenCount(1000),
    repoMap,
    contextResult,
    selectedFiles: selectedPaths.map(mk),
    guardResult,
    safeFiles: safePaths.map(mk),
    transformResult,
    ladderFiles: prunedPaths.map(mk),
    prunedFiles: prunedPaths.map((p) => {
      const base = mk(p);
      if (overrides.omitPrunedScoreSignals === true) return base;
      return {
        ...base,
        scoreSignals: {
          pathRelevance: 0.1,
          importProximity: 0.2,
          symbolRelevance: 0.3,
          recency: 0.4,
          sizePenalty: 0.5,
          ruleBoostCount: 0,
          rulePenaltyCount: 1,
        },
      };
    }),
    assembledPrompt: "",
    promptTotal: toTokenCount(0),
  };
}

describe("buildSelectionTraceForLog", () => {
  it("build_selection_trace_guard_blocked", () => {
    const r = stubPipelineResult({});
    const trace = buildSelectionTraceForLog(r);
    const blocked = trace.excludedFiles.filter(
      (e) => e.reason === EXCLUSION_REASON.GUARD_BLOCKED,
    );
    expect(blocked.some((e) => e.path === toRelativePath("src/out.ts"))).toBe(true);
  });

  it("respects_excluded_cap_and_sort_order", () => {
    const contextExcluded: SelectionTraceExcludedRow[] = Array.from(
      { length: 60 },
      (_, i) => ({
        path: toRelativePath(`z${String(i).padStart(2, "0")}.ts`),
        score: i,
        reason: EXCLUSION_REASON.MAX_FILES,
      }),
    );
    const r = stubPipelineResult({
      contextExcluded,
      selectedPaths: ["only.ts"],
      safePaths: ["only.ts"],
      prunedPaths: ["only.ts"],
    });
    const trace = buildSelectionTraceForLog(r);
    expect(trace.excludedFiles.length).toBe(50);
    expect(trace.excludedFiles[0]?.score).toBe(59);
  });

  it("synthesizes_zero_signals_when_missing", () => {
    const r = stubPipelineResult({
      selectedPaths: ["a.ts"],
      safePaths: ["a.ts"],
      prunedPaths: ["a.ts"],
      omitPrunedScoreSignals: true,
    });
    const trace = buildSelectionTraceForLog(r);
    expect(trace.selectedFiles[0]?.signals.rulePenaltyCount).toBe(0);
    expect(trace.selectedFiles[0]?.signals.pathRelevance).toBe(0);
  });
});
