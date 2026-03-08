// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
}
