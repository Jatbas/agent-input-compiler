// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";

// Wraps fs.readFileSync with mtime-based caching so repeated reads
// of the same unchanged file (within or across compilations) hit memory.
export function createCachingFileContentReader(
  projectRoot: AbsolutePath,
): FileContentReader {
  const cache = new Map<string, { readonly content: string; readonly mtimeMs: number }>();
  return {
    async getContent(pathRel: RelativePath): Promise<string> {
      const full = path.join(projectRoot, pathRel);
      const stat = await fs.promises.stat(full);
      const mtimeMs = stat.mtimeMs;
      const cached = cache.get(pathRel);
      if (cached !== undefined && cached.mtimeMs === mtimeMs) {
        return cached.content;
      }
      const content = await fs.promises.readFile(full, "utf8");
      cache.set(pathRel, { content, mtimeMs });
      return content;
    },
  };
}
