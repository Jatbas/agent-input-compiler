import { type Brand } from "./brand.js";

// Percentage as a decimal in the range [0, 1]. 0.825 = 82.5%.
export type Percentage = Brand<number, "Percentage">;

// Classification confidence in the range [0, 1].
export type Confidence = Brand<number, "Confidence">;

// File relevance score in the range [0, 1].
export type RelevanceScore = Brand<number, "RelevanceScore">;

export function toPercentage(value: number): Percentage {
  return value as Percentage;
}

export function toConfidence(value: number): Confidence {
  return value as Confidence;
}

export function toRelevanceScore(value: number): RelevanceScore {
  return value as RelevanceScore;
}
