// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export function minMaxNorm(values: readonly number[], value: number): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 1;
  return (value - min) / (max - min);
}
