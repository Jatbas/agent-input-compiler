// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export type ScoringWeights = {
  readonly pathRelevance: number;
  readonly importProximity: number;
  readonly symbolRelevance: number;
  readonly recency: number;
  readonly sizePenalty: number;
};

export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: ScoringWeights;
}
