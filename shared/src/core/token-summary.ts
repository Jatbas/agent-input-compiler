import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import { toTokenCount } from "#core/types/units.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

export function sumFileTokens(files: readonly SelectedFile[]): TokenCount {
  const n = files.reduce((acc, f) => acc + (f.estimatedTokens as number), 0);
  return toTokenCount(n);
}

export function sumTransformTokens(
  metadata: readonly { readonly transformedTokens: TokenCount }[],
): TokenCount {
  const n = metadata.reduce((acc, m) => acc + (m.transformedTokens as number), 0);
  return toTokenCount(n);
}

export function buildSummarisationTiers(
  files: readonly SelectedFile[],
): Readonly<Record<InclusionTier, number>> {
  const initial: Record<InclusionTier, number> = {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  };
  return files.reduce(
    (acc, f) => ({ ...acc, [f.tier]: acc[f.tier] + 1 }),
    initial,
  ) as Readonly<Record<InclusionTier, number>>;
}
