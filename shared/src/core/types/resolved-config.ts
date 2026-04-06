// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

export interface ResolvedConfig {
  readonly contextBudget: {
    readonly maxTokens: TokenCount;
    readonly perTaskClass: Readonly<{ [K in TaskClass]?: TokenCount }>;
  };
  readonly heuristic: {
    readonly maxFiles: number;
  };
  readonly model?: { readonly id?: string };
  readonly enabled: boolean;
  readonly guardAllowPatterns: readonly string[];
  readonly devMode: boolean;
}

export function defaultResolvedConfig(): ResolvedConfig {
  return {
    contextBudget: {
      maxTokens: toTokenCount(0),
      perTaskClass: {},
    },
    heuristic: { maxFiles: 0 },
    enabled: true,
    guardAllowPatterns: [],
    devMode: false,
  };
}
