// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  ConversationSummary,
  StatusAggregates,
} from "@jatbas/aic-core/core/types/status-types.js";
import type { ConversationId } from "@jatbas/aic-core/core/types/identifiers.js";

export interface StatusStore {
  getSummary(): StatusAggregates;
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
}
