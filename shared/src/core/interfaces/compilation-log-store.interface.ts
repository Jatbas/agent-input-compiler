// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CompilationLogEntry } from "@jatbas/aic-shared/core/types/compilation-log-entry.js";

export interface CompilationLogStore {
  record(entry: CompilationLogEntry): void;
}
