// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { HeuristicSelector } from "../heuristic-selector.js";
import { RelatedFilesBoostContextSelector } from "../related-files-boost-context-selector.js";
import type { ImportProximityScorer } from "@jatbas/aic-core/core/interfaces/import-proximity-scorer.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import { TASK_CLASS, TOOL_OUTPUT_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { toAbsolutePath, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toBytes } from "@jatbas/aic-core/core/types/units.js";
import { toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

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

describe("RelatedFilesBoostContextSelector", () => {
  const noProviders: readonly LanguageProvider[] = [];
  const stubScorer: ImportProximityScorer = {
    getScores: () => Promise.resolve(new Map()),
  };

  it("related_files_boost_changes_order", async () => {
    const repo = makeRepo([
      { path: "src/a.ts", tokens: 10, lastModified: "2024-01-01T00:00:00.000Z" },
      { path: "src/b.ts", tokens: 10, lastModified: "2024-01-01T00:00:00.000Z" },
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
    const inner = new HeuristicSelector(
      noProviders,
      { maxFiles: 20 },
      stubScorer,
      stubScorer,
    );
    const selector = new RelatedFilesBoostContextSelector(inner);
    const withoutTools = await selector.selectContext(
      task,
      repo,
      toTokenCount(1000),
      rulePack,
    );
    expect(withoutTools.files[0]?.path).toBe(toRelativePath("src/a.ts"));
    const withTools = await selector.selectContext(
      task,
      repo,
      toTokenCount(1000),
      rulePack,
      [
        {
          type: TOOL_OUTPUT_TYPE.COMMAND_OUTPUT,
          content: "x",
          relatedFiles: [toRelativePath("src/b.ts")],
        },
      ],
    );
    expect(withTools.files[0]?.path).toBe(toRelativePath("src/b.ts"));
  });
});
