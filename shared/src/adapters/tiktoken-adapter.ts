import { encoding_for_model } from "tiktoken";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { TokenCount } from "#core/types/units.js";
import { toTokenCount } from "#core/types/units.js";

export class TiktokenAdapter implements TokenCounter {
  constructor() {}

  countTokens(text: string): TokenCount {
    try {
      const encoder = encoding_for_model("gpt-4");
      const count = encoder.encode(text).length;
      return toTokenCount(count);
    } catch {
      const wordCount = text.split(/\s+/).filter((s) => s.length > 0).length;
      return toTokenCount(Math.ceil(wordCount * 1.3));
    }
  }
}
