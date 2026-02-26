export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: {
    readonly pathRelevance: number;
    readonly importProximity: number;
    readonly recency: number;
    readonly sizePenalty: number;
  };
}
