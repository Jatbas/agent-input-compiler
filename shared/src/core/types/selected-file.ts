import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { RelevanceScore } from "#core/types/scores.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
}

export interface ContextResult {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: TokenCount;
  readonly truncated: boolean;
}
