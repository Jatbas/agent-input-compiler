// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-shared/core/types/selected-file.js";

export interface LineLevelPruner {
  prune(
    files: readonly SelectedFile[],
    subjectTokens: readonly string[],
  ): Promise<readonly SelectedFile[]>;
}
