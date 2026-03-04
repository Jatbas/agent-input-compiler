export type ScoringWeights = {
  readonly pathRelevance: number;
  readonly importProximity: number;
  readonly recency: number;
  readonly sizePenalty: number;
};

export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: ScoringWeights;
}
