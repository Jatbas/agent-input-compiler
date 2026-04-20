// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import type { Confidence } from "@jatbas/aic-core/core/types/scores.js";

export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
  readonly subjectTokens: readonly string[];
  readonly specificityScore: Confidence;
  readonly underspecificationIndex: Confidence;
}
