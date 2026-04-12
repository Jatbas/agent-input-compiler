// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "./paths.js";
import type { TokenCount } from "./units.js";
import type { Percentage } from "./scores.js";

export type SpecTypeUsage =
  | "implements"
  | "calls-methods"
  | "constructs"
  | "passes-through"
  | "names-only";

export type SpecInclusionTier = "verbatim" | "signature-path" | "path-only";

export const SPEC_USAGE_TO_INITIAL_TIER: Readonly<
  Record<SpecTypeUsage, SpecInclusionTier>
> = {
  implements: "verbatim",
  "calls-methods": "verbatim",
  constructs: "verbatim",
  "passes-through": "signature-path",
  "names-only": "path-only",
} as const;

export interface SpecTypeRef {
  readonly name: string;
  readonly path: RelativePath;
  readonly content: string;
  readonly usage: SpecTypeUsage;
  readonly estimatedTokens: TokenCount;
}

export interface SpecCodeBlock {
  readonly label: string;
  readonly content: string;
  readonly estimatedTokens: TokenCount;
}

export interface SpecProseBlock {
  readonly label: string;
  readonly content: string;
  readonly estimatedTokens: TokenCount;
}

export interface SpecificationInput {
  readonly types: readonly SpecTypeRef[];
  readonly codeBlocks: readonly SpecCodeBlock[];
  readonly prose: readonly SpecProseBlock[];
}

export interface SpecCompilationResult {
  readonly compiledSpec: string;
  readonly meta: {
    readonly totalTokensRaw: TokenCount;
    readonly totalTokensCompiled: TokenCount;
    readonly reductionPct: Percentage;
    readonly typeTiers: Readonly<Record<string, SpecInclusionTier>>;
    readonly transformTokensSaved: TokenCount;
  };
}
