// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { AbsolutePath, RelativePath } from "@jatbas/aic-core/core/types/paths.js";

// mtime-based LRU: repeated reads of unchanged files hit memory; cap prevents unbounded growth.
export function createCachingFileContentReader(
  projectRoot: AbsolutePath,
  options?: { readonly maxEntries?: number },
): FileContentReader {
  const maxEntries = options?.maxEntries ?? 500;
  const cache = new Map<string, { readonly content: string; readonly mtimeMs: number }>();
  return {
    async getContent(pathRel: RelativePath): Promise<string> {
      const full = path.join(projectRoot, pathRel);
      const stat = await fs.promises.stat(full);
      const mtimeMs = stat.mtimeMs;
      const cached = cache.get(pathRel);
      if (cached !== undefined && cached.mtimeMs === mtimeMs) {
        // Map keeps insertion order; delete then set moves this key to the end so iterator start stays LRU for eviction.
        cache.delete(pathRel);
        cache.set(pathRel, cached);
        return cached.content;
      }
      const content = await fs.promises.readFile(full, "utf8");
      cache.set(pathRel, { content, mtimeMs });
      if (cache.size > maxEntries) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      return content;
    },
  };
}
