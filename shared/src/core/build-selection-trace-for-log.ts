// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { PipelineStepsResult } from "@jatbas/aic-core/core/run-pipeline-steps.js";
import {
  EXCLUSION_REASON,
  type SelectionTrace,
  type SelectionTraceExcludedRow,
  type SelectionTraceSelectedRow,
} from "@jatbas/aic-core/core/types/selection-trace.js";

const ZERO_SIGNALS: SelectionTraceSelectedRow["signals"] = {
  pathRelevance: 0,
  importProximity: 0,
  symbolRelevance: 0,
  recency: 0,
  sizePenalty: 0,
  ruleBoostCount: 0,
  rulePenaltyCount: 0,
};

const EXCLUDED_CAP = 50;

export function buildSelectionTraceForLog(r: PipelineStepsResult): SelectionTrace {
  const selectedFiles: readonly SelectionTraceSelectedRow[] = r.prunedFiles.map((f) => ({
    path: f.path,
    score: Number(f.relevanceScore),
    signals: f.scoreSignals ?? ZERO_SIGNALS,
  }));
  const safePaths = new Set(r.safeFiles.map((f) => f.path));
  const guardExcluded: readonly SelectionTraceExcludedRow[] = r.selectedFiles
    .filter((f) => !safePaths.has(f.path))
    .map((f) => ({
      path: f.path,
      score: Number(f.relevanceScore),
      reason: EXCLUSION_REASON.GUARD_BLOCKED,
    }));
  const mergedExcluded: readonly SelectionTraceExcludedRow[] = [
    ...r.contextResult.traceExcludedFiles,
    ...guardExcluded,
  ];
  const sortedExcluded = mergedExcluded.toSorted((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });
  const excludedFiles = sortedExcluded.slice(0, EXCLUDED_CAP);
  return { selectedFiles, excludedFiles };
}
