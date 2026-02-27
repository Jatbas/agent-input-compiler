import type { TokenCount } from "#core/types/units.js";
import type { TaskClass } from "#core/types/enums.js";
import { toTokenCount } from "#core/types/units.js";

export interface ResolvedConfig {
  readonly contextBudget: {
    readonly maxTokens: TokenCount;
    readonly perTaskClass: Readonly<{ [K in TaskClass]?: TokenCount }>;
  };
  readonly heuristic: {
    readonly maxFiles: number;
  };
}

export function defaultResolvedConfig(): ResolvedConfig {
  return {
    contextBudget: {
      maxTokens: toTokenCount(8000),
      perTaskClass: {},
    },
    heuristic: { maxFiles: 20 },
  };
}
