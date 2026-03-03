import type { ConversationSummary, StatusAggregates } from "#core/types/status-types.js";
import type { ConversationId } from "#core/types/identifiers.js";

export interface StatusStore {
  getSummary(): StatusAggregates;
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
}
