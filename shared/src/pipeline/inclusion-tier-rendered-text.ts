// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { getProvider } from "./get-provider.js";

type TierTextFn = (
  content: string,
  provider: LanguageProvider | undefined,
  filePath: string,
) => string;

const TIER_TEXT: Readonly<Record<InclusionTier, TierTextFn>> = {
  [INCLUSION_TIER.L0]: (content) => content,
  [INCLUSION_TIER.L1]: (content, provider, filePath) => {
    if (provider === undefined) {
      return TIER_TEXT[INCLUSION_TIER.L2](content, provider, filePath);
    }
    const chunks = provider.extractSignaturesWithDocs(content);
    return chunks.map((c) => c.content).join("\n");
  },
  [INCLUSION_TIER.L2]: (content, provider) => {
    if (provider !== undefined) {
      const chunks = provider.extractSignaturesOnly(content);
      return chunks.map((c) => c.content).join("\n");
    }
    const matches = content.match(/(?:function|class|def|pub\s+fn)\s+\w+/g) ?? [];
    return matches.join("\n");
  },
  [INCLUSION_TIER.L3]: (content, provider, filePath) => {
    if (provider !== undefined) {
      const names = provider.extractNames(content);
      return filePath + "\n" + names.map((n) => n.name).join(", ");
    }
    return filePath + "\n";
  },
};

export function renderInclusionTierText(
  filePath: string,
  tier: InclusionTier,
  sourceText: string,
  languageProviders: readonly LanguageProvider[],
): string {
  const provider = getProvider(filePath, languageProviders);
  return TIER_TEXT[tier](sourceText, provider, filePath);
}
