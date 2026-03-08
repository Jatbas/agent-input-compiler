// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ResolvedConfig } from "#core/types/resolved-config.js";

export interface LoadConfigResult {
  readonly config: ResolvedConfig;
  readonly rawJson?: string;
}
