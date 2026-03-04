import type { TokenCount } from "#core/types/units.js";

export interface SessionBudgetContext {
  readonly conversationTokens?: TokenCount;
}
