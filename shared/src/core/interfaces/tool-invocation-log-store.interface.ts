// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ToolInvocationLogEntry } from "@jatbas/aic-core/core/types/tool-invocation-log-entry.js";

export interface ToolInvocationLogStore {
  record(entry: ToolInvocationLogEntry): void;
}
