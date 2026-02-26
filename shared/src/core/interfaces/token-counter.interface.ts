import type { TokenCount } from "#core/types/units.js";

export interface TokenCounter {
  countTokens(text: string): TokenCount;
}
