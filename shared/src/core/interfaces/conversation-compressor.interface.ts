import type { SessionStep } from "#core/types/session-dedup-types.js";

export interface ConversationCompressor {
  compress(steps: readonly SessionStep[]): string;
}
