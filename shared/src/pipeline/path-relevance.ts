// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export function pathRelevance(filePath: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0;
  const lower = filePath.toLowerCase();
  const hits = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return Math.min(1, hits.length / keywords.length);
}
