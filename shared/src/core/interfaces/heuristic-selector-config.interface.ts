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
