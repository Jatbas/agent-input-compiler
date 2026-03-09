// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";

export interface SessionBudgetContext {
  readonly conversationTokens?: TokenCount;
}
