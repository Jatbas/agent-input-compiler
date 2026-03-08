// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SessionStep } from "@jatbas/aic-shared/core/types/session-dedup-types.js";

export interface ConversationCompressor {
  compress(steps: readonly SessionStep[]): string;
}
