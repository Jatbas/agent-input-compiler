// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { IgnoreProvider } from "@jatbas/aic-core/core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ignore from "ignore";

type IgnoreInstance = ReturnType<typeof ignore>;

export class IgnoreAdapter implements IgnoreProvider {
  private readonly cache = new Map<string, IgnoreInstance>();

  accepts(relativePath: RelativePath, root: AbsolutePath): boolean {
    const rootStr = root;
    const cached = this.cache.get(rootStr);
    if (cached !== undefined) return !cached.ignores(relativePath);
    const gitignorePath = path.join(rootStr, ".gitignore");
    const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
    const ig = ignore().add(content);
    this.cache.set(rootStr, ig);
    return !ig.ignores(relativePath);
  }
}
