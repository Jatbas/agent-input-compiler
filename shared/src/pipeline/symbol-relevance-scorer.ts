// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ImportProximityScorer } from "@jatbas/aic-core/core/interfaces/import-proximity-scorer.interface.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { FileEntry, RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { getProvider } from "./get-provider.js";

const CONCURRENCY_LIMIT = 50;

function scoreForFile(
  entry: FileEntry,
  subjectTokens: readonly string[],
  fileContentReader: FileContentReader,
  languageProviders: readonly LanguageProvider[],
): Promise<number> {
  const provider = getProvider(entry.path, languageProviders);
  if (provider === undefined) return Promise.resolve(0);
  return fileContentReader
    .getContent(entry.path)
    .then((content) => {
      const symbols = provider.extractNames(content);
      const matchCount = subjectTokens.filter((token) =>
        symbols.some((s) => s.name.toLowerCase().includes(token.toLowerCase())),
      ).length;
      return subjectTokens.length === 0
        ? 0
        : Math.min(1, matchCount / subjectTokens.length);
    })
    .catch(() => 0);
}

async function scoreInBatches(
  files: readonly FileEntry[],
  subjectTokens: readonly string[],
  fileContentReader: FileContentReader,
  languageProviders: readonly LanguageProvider[],
): Promise<ReadonlyMap<RelativePath, number>> {
  const result = new Map<RelativePath, number>();
  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const batch = files.slice(i, i + CONCURRENCY_LIMIT);
    const scores = await Promise.all(
      batch.map((entry) =>
        scoreForFile(entry, subjectTokens, fileContentReader, languageProviders).then(
          (score) => [entry.path, score] as const,
        ),
      ),
    );
    for (const [p, s] of scores) result.set(p, s);
  }
  return result;
}

export class SymbolRelevanceScorer implements ImportProximityScorer {
  constructor(
    private readonly fileContentReader: FileContentReader,
    private readonly languageProviders: readonly LanguageProvider[],
  ) {}

  async getScores(
    repo: RepoMap,
    task: TaskClassification,
  ): Promise<ReadonlyMap<RelativePath, number>> {
    if (task.subjectTokens.length === 0) {
      const zeroMap = new Map<RelativePath, number>();
      for (const entry of repo.files) zeroMap.set(entry.path, 0);
      return zeroMap;
    }
    return scoreInBatches(
      repo.files,
      task.subjectTokens,
      this.fileContentReader,
      this.languageProviders,
    );
  }
}
