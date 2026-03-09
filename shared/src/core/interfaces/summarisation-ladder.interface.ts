// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";

export interface SummarisationLadder {
  compress(
    files: readonly SelectedFile[],
    budget: TokenCount,
    subjectTokens?: readonly string[],
  ): Promise<readonly SelectedFile[]>;
}
