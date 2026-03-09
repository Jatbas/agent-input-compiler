// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Temporary stub — remove when real CompilationRunner is wired.
import type { CompilationMeta } from "@jatbas/aic-core/core/types/compilation-types.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage, toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import {
  TASK_CLASS,
  EDITOR_ID,
  INCLUSION_TIER,
} from "@jatbas/aic-core/core/types/enums.js";

export const STUB_COMPILATION_META: CompilationMeta = {
  intent: "",
  taskClass: TASK_CLASS.GENERAL,
  filesSelected: 0,
  filesTotal: 0,
  tokensRaw: toTokenCount(0),
  tokensCompiled: toTokenCount(0),
  tokenReductionPct: toPercentage(0),
  cacheHit: false,
  durationMs: toMilliseconds(0),
  modelId: "",
  editorId: EDITOR_ID.GENERIC,
  transformTokensSaved: toTokenCount(0),
  summarisationTiers: {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  },
  guard: null,
  contextCompleteness: toConfidence(1),
};
