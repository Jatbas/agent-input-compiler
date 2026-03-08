// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-shared/core/types/selected-file.js";
import type { GuardResult } from "@jatbas/aic-shared/core/types/guard-types.js";

export interface ContextGuard {
  scan(files: readonly SelectedFile[]): Promise<{
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  }>;
}
