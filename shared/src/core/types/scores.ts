// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { type Brand } from "./brand.js";

// Percentage as a decimal in the range [0, 1]. 0.825 = 82.5%.
export type Percentage = Brand<number, "Percentage">;

// Unit-interval ratio from 0 through 1 inclusive.
export type Ratio01 = Brand<number, "Ratio01">;

// Display percent from 0 through 100 inclusive.
export type Percentage100 = Brand<number, "Percentage100">;

// Classification confidence in the range [0, 1].
export type Confidence = Brand<number, "Confidence">;

// File relevance score in the range [0, 1].
export type RelevanceScore = Brand<number, "RelevanceScore">;

export function toPercentage(value: number): Percentage {
  return value as Percentage;
}

export function toRatio01(value: number): Ratio01 {
  return value as Ratio01;
}

export function toPct100(value: number): Percentage100 {
  return value as Percentage100;
}

export function pct100FromRatio01(ratio: Ratio01): Percentage100 {
  return toPct100(Number(ratio) * 100);
}

export function toConfidence(value: number): Confidence {
  return value as Confidence;
}

export function toRelevanceScore(value: number): RelevanceScore {
  return value as RelevanceScore;
}
