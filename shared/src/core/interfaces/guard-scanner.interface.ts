// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-shared/core/types/selected-file.js";
import type { GuardFinding } from "@jatbas/aic-shared/core/types/guard-types.js";

export interface GuardScanner {
  readonly name: string;
  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
