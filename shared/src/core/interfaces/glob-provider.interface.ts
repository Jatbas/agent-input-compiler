// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { PathWithStat } from "@jatbas/aic-shared/core/types/path-with-stat.js";

export interface GlobProvider {
  find(patterns: readonly string[], cwd: AbsolutePath): Promise<readonly RelativePath[]>;
  findWithStats(
    patterns: readonly string[],
    cwd: AbsolutePath,
  ): Promise<readonly PathWithStat[]>;
}
