// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import { toTokenCount } from "#core/types/units.js";
import { isBinaryExtension, languageFromExtension } from "./file-entry-utils.js";

const DEFAULT_NEGATIVE_PATTERNS: readonly string[] = [
  "!node_modules/**",
  "!.git/**",
  "!dist/**",
  "!build/**",
  "!coverage/**",
  "!.aic/**",
  "!.next/**",
  "!.nuxt/**",
  "!__pycache__/**",
  "!.tsbuildinfo",
];

export class FileSystemRepoMapSupplier implements RepoMapSupplier {
  constructor(
    private readonly globProvider: GlobProvider,
    private readonly ignoreProvider: IgnoreProvider,
  ) {}

  async getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap> {
    const patterns = ["**/*", ...DEFAULT_NEGATIVE_PATTERNS];
    const withStats = await this.globProvider.findWithStats(patterns, projectRoot);
    const entries = withStats
      .filter((e) => this.ignoreProvider.accepts(e.path, projectRoot))
      .reduce<readonly FileEntry[]>((acc, entry) => {
        const ext = path.extname(entry.path).toLowerCase();
        if (isBinaryExtension(ext)) return acc;
        const language = languageFromExtension(ext);
        const estimatedTokens = toTokenCount(Math.ceil(entry.sizeBytes / 4));
        return [
          ...acc,
          {
            path: entry.path,
            language,
            sizeBytes: entry.sizeBytes,
            estimatedTokens,
            lastModified: entry.lastModified,
          },
        ];
      }, []);
    const totalTokensRaw = entries.reduce((sum, e) => sum + e.estimatedTokens, 0);
    return Promise.resolve({
      root: projectRoot,
      files: entries,
      totalFiles: entries.length,
      totalTokens: toTokenCount(totalTokensRaw),
    });
  }
}
